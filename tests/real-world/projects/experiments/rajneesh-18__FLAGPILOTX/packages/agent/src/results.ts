/**
 * Interpret Flagsmith experiment results, using the SAME rules as Flagsmith itself.
 *
 * Thresholds copied from Flagsmith's source (github.com/Flagsmith/flagsmith):
 *  - api/experimentation/constants: RESULTS_MIN_IDENTITIES_PER_VARIANT = 50,
 *    RESULTS_MIN_CONVERSIONS_PER_VARIANT = 5 (occurrence metrics), SRM_MIN_TOTAL_IDENTITIES = 100.
 *    The server returns `inference: null` for a variant until BOTH arms pass both floors.
 *  - frontend .../ExperimentMetricScorecard.tsx: SRM is "broken" when srm_p_value < 0.001.
 *  - Docs: recommend a rollout only at >= 95% chance to beat control; inconclusive if the
 *    95% credible interval crosses zero; don't act on results with an SRM warning.
 *
 * Pure function over the raw API payload: easy to unit-test with recorded fixtures.
 */
import { z } from 'zod';

export const MIN_IDENTITIES_PER_VARIANT = 50;
export const MIN_CONVERSIONS_PER_VARIANT = 5;
export const SRM_P_THRESHOLD = 0.001;
export const WIN_THRESHOLD = 0.95;

// ---- Raw payload schema (from test/fixtures/results-*.json). Validated so surprises fail loudly.
const InferenceSchema = z.object({ lift: z.number(), ci_low: z.number(), ci_high: z.number(), chance_to_win: z.number() });
const VariantStatsSchema = z.object({ n: z.number(), sum: z.number(), sum_squares: z.number() });
export const ResultsResponseSchema = z.object({
  results: z.object({
    as_of: z.string().nullable(),
    is_final: z.boolean(),
    last_error_at: z.string().nullable().optional(),
    payload: z
      .object({
        metrics: z.array(
          z.object({
            metric_id: z.number(),
            variants: z.record(VariantStatsSchema),
            inference: z.record(InferenceSchema.nullable()),
          }),
        ),
        srm_p_value: z.number().nullable(),
      })
      .nullable(),
  }),
});

export interface VariantRow {
  key: string;
  exposures: number;
  conversions: number;
  rate: number;
  /** Relative lift vs control, e.g. 0.14 = +14%. Undefined for control / not enough data. */
  lift?: number;
  ciLow?: number;
  ciHigh?: number;
  chanceToWin?: number;
}

export type Verdict =
  | 'no_data' // nothing computed yet
  | 'collecting' // below Flagsmith's minimum sample
  | 'srm' // sample ratio mismatch: don't trust anything
  | 'inconclusive' // keep running
  | 'winner' // a variant beats control: propose rollout
  | 'control_wins'; // control clearly better: propose keeping control

export interface Interpretation {
  asOf: string | null;
  isFinal: boolean;
  totalUsers: number;
  srmPValue: number | null;
  rows: VariantRow[];
  /** Treatment with the highest chance to win (Flagsmith's "best treatment"). */
  best: VariantRow | null;
  verdict: Verdict;
  /** Why we reached the verdict, one bullet each. */
  reasons: string[];
  /** One-line recommendation. */
  recommendation: string;
}

export function interpretResults(raw: unknown, metricId?: number): Interpretation {
  const { results } = ResultsResponseSchema.parse(raw);
  const metric = results.payload?.metrics.find((m) => metricId === undefined || m.metric_id === metricId);
  const base = { asOf: results.as_of, isFinal: results.is_final, srmPValue: results.payload?.srm_p_value ?? null };

  if (!metric || !metric.variants.control) {
    return { ...base, totalUsers: 0, rows: [], best: null, verdict: 'no_data', reasons: ['No exposures recorded yet.'], recommendation: 'Keep running. Check that the app calls getExperimentFlag() for identified users.' };
  }

  // Control first, then treatments in API order.
  const keys = ['control', ...Object.keys(metric.variants).filter((k) => k !== 'control')];
  const rows: VariantRow[] = keys.map((key) => {
    const s = metric.variants[key]!;
    const inf = key === 'control' ? null : metric.inference[key];
    // For occurrence metrics, `sum` = number of identities that converted at least once.
    return {
      key,
      exposures: s.n,
      conversions: s.sum,
      rate: s.n ? s.sum / s.n : 0,
      ...(inf ? { lift: inf.lift, ciLow: inf.ci_low, ciHigh: inf.ci_high, chanceToWin: inf.chance_to_win } : {}),
    };
  });
  const totalUsers = rows.reduce((t, r) => t + r.exposures, 0);
  const treatments = rows.filter((r) => r.key !== 'control');
  const best = treatments.filter((r) => r.chanceToWin !== undefined).sort((a, b) => b.chanceToWin! - a.chanceToWin!)[0] ?? null;
  const reasons: string[] = [];
  const out = (verdict: Verdict, recommendation: string): Interpretation => ({ ...base, totalUsers, rows, best, verdict, reasons, recommendation });

  // 1. SRM first: if the split itself is broken, no other number is trustworthy.
  if (base.srmPValue !== null && base.srmPValue < SRM_P_THRESHOLD) {
    reasons.push(`Sample ratio mismatch: traffic split differs from the configured one (p = ${base.srmPValue.toPrecision(2)} < ${SRM_P_THRESHOLD}).`);
    return out('srm', "Don't act on these results. Check the rollout and SDK integration (e.g. caching or redirects dropping one variant).");
  }

  // 2. Minimum sample, mirroring the server's floors.
  if (!best) {
    for (const r of rows) {
      if (r.exposures < MIN_IDENTITIES_PER_VARIANT) reasons.push(`\`${r.key}\` has ${r.exposures} of the ${MIN_IDENTITIES_PER_VARIANT} identities needed.`);
      else if (r.conversions < MIN_CONVERSIONS_PER_VARIANT) reasons.push(`\`${r.key}\` has ${r.conversions} of the ${MIN_CONVERSIONS_PER_VARIANT} conversions needed.`);
    }
    if (!reasons.length) reasons.push('Flagsmith has not computed inference yet.');
    return out('collecting', 'Keep running: collecting data.');
  }

  // 3. Control clearly better (Flagsmith: control chance = 1 - sum of treatment chances).
  const controlChance = Math.max(0, 1 - treatments.reduce((t, r) => t + (r.chanceToWin ?? 0), 0));
  if (controlChance >= WIN_THRESHOLD && treatments.every((r) => r.ciHigh !== undefined && r.ciHigh < 0)) {
    reasons.push(`Control has a ${chancePct(controlChance)} chance to be best and every variant's interval is below zero.`);
    return out('control_wins', 'Keep control: the change makes things worse.');
  }

  // 4. Winner needs BOTH: >= 95% chance AND an interval entirely above zero.
  const strongEnough = best.chanceToWin! >= WIN_THRESHOLD;
  const crossesZero = best.ciLow! <= 0;
  if (strongEnough && !crossesZero) {
    reasons.push(`\`${best.key}\` has a ${chancePct(best.chanceToWin!)} chance to beat control (≥ ${pct(WIN_THRESHOLD)}).`);
    reasons.push(`Its 95% credible interval (${signedPct(best.ciLow!)} to ${signedPct(best.ciHigh!)}) is entirely above zero.`);
    reasons.push('No sample ratio mismatch warning.');
    return out('winner', `Roll out \`${best.key}\` to 100%.`);
  }

  if (!strongEnough) reasons.push(`\`${best.key}\` has a ${chancePct(best.chanceToWin!)} chance to beat control; ${pct(WIN_THRESHOLD)} is needed.`);
  if (crossesZero) reasons.push(`The 95% credible interval (${signedPct(best.ciLow!)} to ${signedPct(best.ciHigh!)}) crosses zero, so the true effect could still be negative.`);
  return out('inconclusive', 'Keep running.');
}

// ---- Formatting helpers shared with render.ts (single source of truth for number formatting).
export const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Probabilities never round to a false certainty: 0.9956 -> ">99%", not "100%". */
export const chancePct = (x: number) => (x > 0.99 ? '>99%' : x < 0.01 ? '<1%' : pct(x));
export const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
export const ratePct = (x: number) => `${(x * 100).toFixed(1)}%`;
