import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type Request, type Response } from 'express';
import { isCarbonLevel, type CarbonLevel, type Evaluation } from '@greengate/flagsmith';
import { ARTICLES, findArticle } from './articles.js';
import { estimateEnergy } from './energy.js';
import { createDemoRuntime, loadDotEnv } from './gate.js';
import { cachedEcoSummary, liveSummary, type Summary } from './summarize.js';

loadDotEnv();

const { gate, flagsmith } = createDemoRuntime();
export { flagsmith };
export const app = express();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
// GREENGATE_DEV_TOOLS=1 keeps the low/moderate/high switcher on in a public, production deploy.
const devTools = process.env.NODE_ENV !== 'production' || process.env.GREENGATE_DEV_TOOLS === '1';

app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());

function identifierFrom(req: Request): string {
  const query = typeof req.query.identifier === 'string' ? req.query.identifier : '';
  const header = req.get('x-gg-uid') || '';
  const cookie = typeof req.cookies?.gg_uid === 'string' ? req.cookies.gg_uid : '';
  return cookie || header || query || crypto.randomUUID();
}

function remember(res: Response, identifier: string): void {
  res.cookie('gg_uid', identifier, {
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
}

function forceLevelFrom(req: Request): CarbonLevel | undefined {
  if (!devTools) return undefined;
  const level = typeof req.query.level === 'string' ? req.query.level : '';
  return isCarbonLevel(level) ? level : undefined;
}

const VARIANTS = new Set<Evaluation['variant']>(['full', 'eco', 'off']);

function trafficLabelFor(req: Request, identifier: string): 'SIMULATED' | null {
  if (identifier.startsWith('sim-') || req.get('x-gg-simulated') === '1' || req.query.simulated === '1') {
    return 'SIMULATED';
  }
  return null;
}

async function decide(identifier: string, level: CarbonLevel | undefined): Promise<Evaluation> {
  const evaluation = await gate.evaluate(identifier, undefined, {
    forceLevel: level,
    zone: process.env.GREENGATE_ZONE || undefined,
  });
  let variant = evaluation.variant;
  let experimentId: number | null = null;
  let experimentVariant: string | null = null;
  // source 'local' means Flagsmith could not be reached, so skip the experiment lookup too.
  if (flagsmith && evaluation.source === 'flagsmith' && evaluation.flags.greengate_enabled) {
    try {
      const flag = await flagsmith.getExperimentFlag('heavy_feature_mode', identifier, {
        carbon_level: evaluation.carbonLevel,
        grid_zone: evaluation.zone,
        greengate_suggested_variant: evaluation.flags.greengate_suggested_variant,
      });
      experimentVariant = 'variant' in flag && typeof flag.variant === 'string' ? flag.variant : null;
      if ('experiment' in flag && flag.experiment?.inExperiment && typeof flag.value === 'string' && VARIANTS.has(flag.value as Evaluation['variant'])) {
        variant = flag.value as Evaluation['variant'];
        experimentId = flag.experiment.id;
      }
    } catch (error) {
      console.log(JSON.stringify({ msg: 'greengate.experiment_flag_failed', message: error instanceof Error ? error.message : String(error) }));
    }
  }
  const result: Evaluation =
    variant === evaluation.variant
      ? evaluation
      : {
          ...evaluation,
          variant,
          flags: { ...evaluation.flags, heavy_feature_mode: variant },
        };
  console.log(
    JSON.stringify({
      msg: 'greengate.decision',
      identifier,
      variant: result.variant,
      carbonLevel: result.carbonLevel,
      zone: result.zone,
      source: result.source,
      carbonSource: result.carbonSource,
      from: result.source === 'flagsmith' ? 'flagsmith' : result.source,
      experimentId,
      experimentVariant,
    }),
  );
  return result;
}

async function summaryFor(slug: string, body: string, variant: Evaluation['variant']): Promise<Summary | null> {
  if (variant === 'off') return null;
  if (variant === 'eco') return cachedEcoSummary(slug, body);
  return liveSummary(body);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, flagsmith: Boolean(flagsmith) });
});

app.get('/api/config', (_req, res) => {
  res.json({ devTools, articleCount: ARTICLES.length });
});

app.post('/api/session', (req, res) => {
  const provided = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  const identifier = provided || identifierFrom(req);
  remember(res, identifier);
  res.json({ identifier });
});

app.post('/api/session/reset', (_req, res) => {
  res.clearCookie('gg_uid');
  const identifier = crypto.randomUUID();
  remember(res, identifier);
  res.json({ identifier });
});

app.get('/api/feed', async (req, res, next) => {
  try {
    const identifier = identifierFrom(req);
    remember(res, identifier);
    const evaluation = await decide(identifier, forceLevelFrom(req));
    const energy = estimateEnergy(evaluation.variant, evaluation.zone, ARTICLES.length);
    res.json({
      identifier,
      trafficLabel: trafficLabelFor(req, identifier),
      devTools,
      decision: evaluation,
      energy,
      assumptions: {
        liveSummaryWh: 0.3,
        cachedSummaryWh: 0.05,
        videoAutoplayWh: 0.2,
        defaultGridGco2PerKwh: 450,
        label: 'estimate',
      },
      articles: ARTICLES.map((article) => ({
        slug: article.slug,
        title: article.title,
        dek: article.dek,
        section: article.section,
        minutes: article.minutes,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/articles/:slug', async (req, res, next) => {
  try {
    const article = findArticle(req.params.slug);
    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    const started = Date.now();
    const identifier = identifierFrom(req);
    remember(res, identifier);
    const evaluation = await decide(identifier, forceLevelFrom(req));
    const summary = await summaryFor(article.slug, article.body, evaluation.variant);
    const energy = estimateEnergy(evaluation.variant, evaluation.zone, 1);
    res.json({
      article,
      trafficLabel: trafficLabelFor(req, identifier),
      summary,
      decision: evaluation,
      energy,
      summaryLatencyMs: Date.now() - started,
      pausedMessage: 'Paused because the grid is dirty right now',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/events', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  const identifier = identifierFrom(req);
  if (name !== 'article_completed' && name !== 'summary_feedback' && name !== 'summary_shown') {
    res.status(400).json({ error: 'Unsupported event' });
    return;
  }
  const value = typeof req.body?.value === 'number' ? req.body.value : undefined;
  const trafficLabel = trafficLabelFor(req, identifier);
  console.log(JSON.stringify({ msg: 'greengate.event', name, identifier, slug: req.body?.slug ?? null, trafficLabel }));
  if (flagsmith) {
    flagsmith.trackEvent(name, { identifier, value });
  }
  res.json({ ok: true, simulated: trafficLabel === 'SIMULATED', trafficLabel, recorded: Boolean(flagsmith) });
});

app.post('/api/events/flush', async (_req, res) => {
  await flagsmith?.flushEvents();
  res.json({ ok: true });
});

app.use(express.static(publicDir));

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Request failed';
  console.log(JSON.stringify({ msg: 'greengate.error', message }));
  res.status(502).json({ error: message });
});
