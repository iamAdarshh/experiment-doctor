/**
 * `flagpilot` local CLI, so FlagPilot can be tried without GitHub Actions.
 *
 *   flagpilot plan <issue.md>       Print the Experiment Plan comment (dry run; touches nothing)
 *   flagpilot demo                  Run the WHOLE flow offline (fake Flagsmith + fake GitHub)
 *   flagpilot doctor [--flag name]  Check a real Flagsmith setup against the troubleshooting list
 *   flagpilot status <experimentId> Print the live scorecard for a real experiment (read-only)
 *
 * Reads FLAGSMITH_CLIENT_ENV_KEY etc. from the environment (or the repo's .env).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlagPilot } from './agent.js';
import { FakeGitHub } from './fakeGithub.js';
import { FlagsmithClient } from './flagsmith.js';
import { planFromIssue } from './planner.js';
import { dryRunSetupCommands, renderPlanComment, renderScorecard, templateSummary } from './render.js';
import { interpretResults } from './results.js';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgRoot, '../..');

/** Load KEY=VALUE lines from the repo's .env without overriding real env vars. Never printed. */
function loadDotEnv() {
  const p = join(repoRoot, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
}

const envKey = () => {
  const k = process.env.FLAGSMITH_CLIENT_ENV_KEY;
  if (!k) throw new Error('Set FLAGSMITH_CLIENT_ENV_KEY (see .env.example).');
  return k;
};

async function plan(file: string) {
  // pnpm runs scripts inside the package dir; resolve against where the user actually ran it.
  const body = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8');
  const title = body.match(/^#\s+(.+)$/m)?.[1] ?? 'Experiment';
  const r = planFromIssue({ title, body });
  if (!r.ok) {
    console.log('FlagPilot needs clarification:\n' + r.questions.map((q) => `- ${q}`).join('\n'));
    process.exitCode = 2;
    return;
  }
  console.log(renderPlanComment(r.plan, r.notes, await dryRunSetupCommands(r.plan, process.env.FLAGSMITH_CLIENT_ENV_KEY ?? '<client-env-key>')));
}

async function demo() {
  const dir = mkdtempSync(join(tmpdir(), 'flagpilot-demo-'));
  process.env.FAKE_FLAGSMITH_STATE = join(dir, 'state.json');
  const fixtures = join(pkgRoot, 'test/fixtures');
  const BOT = 'flagpilot[bot]';
  const step = (s: string) => console.log(`\n\x1b[1;36m━━━ ${s} ━━━\x1b[0m`);
  const show = (kind: string, md: string) => console.log(`\x1b[2m[${kind}]\x1b[0m\n${md.replace(/<!-- flagpilot-state:.*?-->/s, '<!-- state hidden -->')}`);

  const gh = new FakeGitHub(
    { number: 1, title: '🧪 Experiment: Pricing CTA', body: readFileSync(join(pkgRoot, 'examples/pricing-cta.md'), 'utf8'), state: 'open', labels: ['flagpilot:experiment'] },
    BOT, {}, repoRoot, (kind, detail) => (kind === 'label' || kind === 'pr' || kind === 'close' ? console.log(`\x1b[33m  → ${kind}: ${detail}\x1b[0m`) : show(kind, detail)),
  );
  const agent = new FlagPilot({
    gh, botLogin: BOT, environmentKey: 'demo-env',
    fs: new FlagsmithClient({ environmentKey: 'demo-env', bin: join(pkgRoot, 'test/fake-flagsmith.mjs') }),
    links: { flagsmithEnv: 'https://app.flagsmith.com/project/0/environment/demo-env', repo: gh.repoUrl },
    log: () => {},
  });
  try {
    step('1. Developer opens an experiment issue: FlagPilot plans (🤖 alone)');
    await agent.onIssue();
    step('2. A non-maintainer tries /approve: refused');
    await agent.onComment(gh.human('/approve', 'drive-by-user', 'NONE'));
    step('3. Maintainer: /approve (👤 gate #1), creates flag, metric, experiment + code PR');
    await agent.onComment(gh.human('/approve'));
    step('4. Maintainer merges the PR and comments /start (👤 gate #2)');
    gh.merge(gh.prs[0]!.number);
    await agent.onComment(gh.human('/start'));
    step('5. Scheduled check with REAL recorded Flagsmith results (🤖 read-only)');
    process.env.FAKE_FLAGSMITH_RESULTS = join(fixtures, 'results-2.json');
    await agent.onSchedule();
    step('6. Later: conclusive results (synthetic fixture), Rollout Proposal');
    process.env.FAKE_FLAGSMITH_RESULTS = join(fixtures, 'results-winner.synthetic.json');
    await agent.onSchedule();
    step('7. Maintainer: /rollout (👤 gate #3), ends experiment, ships winner, cleanup PR');
    await agent.onComment(gh.human('/rollout'));
    console.log('\n✅ Demo complete. Nothing was sent to Flagsmith or GitHub.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function doctor(flag?: string) {
  const fs = new FlagsmithClient({ environmentKey: envKey() });
  let failures = 0;
  const check = async (name: string, fn: () => Promise<string | true>) => {
    try {
      const r = await fn();
      console.log(`✅ ${name}${r === true ? '' : `: ${r}`}`);
    } catch (e) {
      failures++;
      console.log(`❌ ${name}: ${(e as Error).message.split('\n')[0]}`);
    }
  };
  const assert = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(msg);
  };

  await check('Flagsmith CLI installed (v2+)', async () => {
    const v = await fs.cliVersion();
    assert(/v[2-9]\./.test(v), `${v}; need v2+`);
    return v;
  });
  await check('Authenticated', async () => (await fs.authStatus()).split('\n').filter((l) => /Identity|source/i.test(l)).join(' · ').replace(/\s+/g, ' '));
  await check('Warehouse connected (required for events)', async () => {
    const w = await fs.warehouseConnections();
    assert(w.length > 0, 'no warehouse connection: connect one in Environment settings');
    return `${w[0]!.warehouse_type} · status ${w[0]!.status} · ${w[0]!.total_events_received} events received`;
  });

  const experiments = await fs.listExperiments().catch(() => []);
  const metrics = await fs.listMetrics().catch(() => []);
  const targets = flag ? [flag] : [...new Set(experiments.filter((e) => e.status !== 'completed').map((e) => (typeof e.feature === 'number' ? String(e.feature) : e.feature.name)))];
  if (!targets.length) console.log('ℹ️  No active experiments; pass --flag <name> to check a specific flag.');

  for (const name of targets) {
    await check(`[${name}] every variant has a key (no key = no exposures)`, async () => {
      const f = await fs.getFeature(name);
      assert(!!f, 'flag not found');
      const missing = (f!.variants ?? []).filter((v) => !v.key);
      assert(missing.length === 0, `variants without key: ${missing.map((v) => v.value).join(', ')}`);
      return `${f!.variants?.length ?? 0} keyed variants`;
    });
    await check(`[${name}] a fresh identity is enrolled in the rollout`, async () => {
      const r = await fs.evaluateForIdentity(`flagpilot-doctor-${Date.now()}`);
      const f = r?.flags.find((x) => x.feature.name === name) as { feature_state_value: unknown; metadata?: { experiment?: { in_experiment?: boolean } } } | undefined;
      assert(!!f, 'flag not served to identities');
      const enrolled = f!.metadata?.experiment?.in_experiment;
      return enrolled ? `enrolled, got "${String(f!.feature_state_value)}"` : `served "${String(f!.feature_state_value)}" (not enrolled: experiment not running, or identity outside rollout %)`;
    });
  }
  await check('Metric event names are snake_case and match code exactly (case-sensitive)', async () => {
    const bad = metrics.filter((m) => !/^[a-z][a-z0-9_]*$/.test(m.definition?.event ?? ''));
    assert(bad.length === 0, `suspicious event names: ${bad.map((m) => m.definition.event).join(', ')}`);
    return metrics.map((m) => m.definition.event).join(', ') || 'no metrics yet';
  });
  console.log(`
Manual checks (SDKs drop bad events SILENTLY: turn on enableLogs while testing):
  • identify() is called before getExperimentFlag()/useExperiment (exposures need an identity)
  • the SAME identifier is used for the exposure and trackEvent()
  • events are flushed (flushEvents() / close()) before the page or process exits
  • event timestamps are within 10 days in the past and 24h in the future
  • event batches are under 2 MiB`);
  process.exitCode = failures ? 1 : 0;
}

async function status(id: number) {
  const fs = new FlagsmithClient({ environmentKey: envKey() });
  const i = interpretResults(await fs.getResults(id));
  console.log(`${templateSummary(i)}\n\n${renderScorecard(i)}`);
}

async function main() {
  loadDotEnv();
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'plan':
      if (!args[0]) throw new Error('usage: flagpilot plan <issue.md>');
      return plan(args[0]);
    case 'demo':
      return demo();
    case 'doctor':
      return doctor(args[args.indexOf('--flag') + 1] && args.includes('--flag') ? args[args.indexOf('--flag') + 1] : undefined);
    case 'status':
      if (!args[0]) throw new Error('usage: flagpilot status <experimentId>');
      return status(Number(args[0]));
    default:
      console.log('usage: flagpilot <plan <issue.md> | demo | doctor [--flag name] | status <experimentId>>');
  }
}

main().catch((e) => {
  console.error(`flagpilot: ${(e as Error).message}`);
  process.exit(1);
});
