// Pure metric logic (EXPERIMENT.md section 3.5). No DOM, no SDK: it takes settled lint states and
// says which Flagsmith metric events should fire. Unit-tested in tests/metrics.test.ts.
import { findCalls, isFlagsmithReceiver, literalEventName, PLACEHOLDER_METRIC, pythonConstructors, usesEvents } from '../lint/rules/shared.ts'
import { stripComments } from '../lint/strip.ts'
import type { Language, LintContext, LintResult } from '../lint/types.ts'

export type MetricName = 'finding_fixed_clean' | 'new_finding_after_edit' | 'finding_resolved' | 'fix_copied'

/** A change touching at least this share of the text is a new baseline (a fresh paste), not an edit. */
export const MAX_CHANGE_FRACTION = 0.6

export interface MetricsState {
  /** The previous settled state; null until the first settled state (the baseline). */
  prev: { text: string; findings: ReadonlyMap<string, string> } | null
  /**
   * Findings reported since the last baseline and not yet resolved with their anchor. A finding that vanished
   * WITHOUT its anchor (a half-typed name, a deleted call) stays open, so the later real fix still counts.
   */
  open: ReadonlyMap<string, string>
  /** Every finding id reported in a settled state so far this session. */
  seen: ReadonlySet<string>
  /** Metrics already sent: one per identity, so each fires at most once. */
  fired: ReadonlySet<MetricName>
}

export function createMetricsState(): MetricsState {
  return { prev: null, open: new Map(), seen: new Set(), fired: new Set() }
}

function prefixSuffixChange(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  const max = Math.min(a.length, b.length)
  let prefix = 0
  while (prefix < max && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
  return (longest - prefix - suffix) / longest
}

/** Share of lines that were removed or added (a multiset diff), for edits in several places. */
function lineChange(a: string, b: string): number {
  const la = a.split(/\r?\n/)
  const lb = b.split(/\r?\n/)
  const counts = new Map<string, number>()
  for (const l of la) counts.set(l, (counts.get(l) ?? 0) + 1)
  let shared = 0
  for (const l of lb) {
    const n = counts.get(l) ?? 0
    if (n > 0) {
      counts.set(l, n - 1)
      shared++
    }
  }
  return Math.max(la.length - shared, lb.length - shared) / Math.max(la.length, lb.length)
}

/**
 * How much of the text changed, 0 (identical) to 1 (unrelated). The smaller of a prefix/suffix measure (good for
 * one edit in a single line) and a line measure (good for several edits), so neither under- nor over-counts a fix.
 */
export function changeFraction(a: string, b: string): number {
  if (a === b) return 0
  return Math.min(prefixSuffixChange(a, b), lineChange(a, b))
}

function contextFor(text: string, language: Language, metricNames: string[]): LintContext {
  return { source: text, code: stripComments(text, language), language, metricNames }
}

/** Does the per-rule anchor of a finding still exist in the code? (section 3.5) */
export function anchorExists(ruleId: string, text: string, language: Language, metricNames: string[] = []): boolean {
  const ctx = contextFor(text, language, metricNames)
  const jsCalls = (names: string) => findCalls(ctx, names, true)
  switch (ruleId) {
    case 'r01': // an SDK init call
      return language === 'js'
        ? jsCalls('init').some((c) => isFlagsmithReceiver(ctx, c.receiver))
        : pythonConstructors(ctx).length > 0
    case 'r02': {
      // the flag read (r02 only applies to files that use events, so that must still hold)
      if (!usesEvents(ctx)) return false
      const reads =
        language === 'js'
          ? 'getValue|hasFeature|getExperimentFlag|getAllFlags|getFlag'
          : 'get_feature_value|is_feature_enabled|get_value|get_experiment_flag|get_flags|get_environment_flags|get_identity_flags'
      return findCalls(ctx, reads, true).length > 0
    }
    case 'r03': {
      // a trackEvent call that now carries an accepted name: in the metric list, or (no list) lower snake_case
      // and not the placeholder. An emptied or half-typed name is not a fix.
      const ok = (name: string | null) =>
        name !== null &&
        (metricNames.length > 0 ? metricNames.includes(name) : /^[a-z][a-z0-9_]*$/.test(name) && name !== PLACEHOLDER_METRIC)
      return findCalls(ctx, language === 'js' ? 'trackEvent' : 'track_event', true).some((c) => ok(literalEventName(c.args)))
    }
    case 'r04': // the Python client construction
      return pythonConstructors(ctx).length > 0
    case 'r05': // at least one init or identify
      return language === 'js'
        ? jsCalls('init|identify').some((c) => isFlagsmithReceiver(ctx, c.receiver))
        : pythonConstructors(ctx).length > 0
    default:
      return false
  }
}

function rememberOnce(state: MetricsState, wanted: MetricName[]): { fire: MetricName[]; fired: Set<MetricName> } {
  const fired = new Set(state.fired)
  const fire = wanted.filter((m) => !fired.has(m))
  for (const m of fire) fired.add(m)
  return { fire, fired }
}

/**
 * Feed one SETTLED state (never a keystroke). Returns the next state and the metrics to send.
 * - The first settled state, and any state that rewrites 60% or more of the text, is a baseline: nothing fires.
 * - finding_resolved: a previously reported (still open) finding is gone, its anchor still exists.
 * - finding_fixed_clean: the same, and no finding id never seen before is present.
 * - new_finding_after_edit: a finding id never seen before appears after an edit.
 */
export function observeSettled(
  state: MetricsState,
  text: string,
  result: Pick<LintResult, 'language' | 'findings'>,
  metricNames: string[] = [],
): { state: MetricsState; fire: MetricName[] } {
  const findings = new Map(result.findings.map((f) => [f.id, f.ruleId] as const))
  const seen = new Set(state.seen)
  for (const id of findings.keys()) seen.add(id)
  const next = (fired: ReadonlySet<MetricName>, open: ReadonlyMap<string, string>): MetricsState => ({
    prev: { text, findings },
    open,
    seen,
    fired,
  })

  const prev = state.prev
  if (prev === null || changeFraction(prev.text, text) >= MAX_CHANGE_FRACTION) {
    return { state: next(state.fired, findings), fire: [] }
  }
  if (prev.text === text) return { state, fire: [] }

  const open = new Map(findings)
  const fixed: string[] = []
  for (const [id, ruleId] of state.open) {
    if (findings.has(id)) continue
    if (anchorExists(ruleId, text, result.language, metricNames)) fixed.push(id)
    else open.set(id, ruleId) // gone without its anchor: not a fix (yet), stays open
  }
  const hasNew = [...findings.keys()].some((id) => !state.seen.has(id))

  const wanted: MetricName[] = []
  if (fixed.length > 0) {
    wanted.push('finding_resolved')
    if (!hasNew) wanted.push('finding_fixed_clean')
  }
  if (hasNew) wanted.push('new_finding_after_edit')
  const { fire, fired } = rememberOnce(state, wanted)
  return { state: next(fired, open), fire }
}

/**
 * Take a new baseline without firing anything: used when the input changed but not by editing the code
 * (puzzle reset, metric-names field edited). Findings seen so far stay seen.
 */
export function rebase(state: MetricsState, text: string, result: Pick<LintResult, 'findings'>): MetricsState {
  const findings = new Map(result.findings.map((f) => [f.id, f.ruleId] as const))
  const seen = new Set(state.seen)
  for (const id of findings.keys()) seen.add(id)
  return { prev: { text, findings }, open: findings, seen, fired: state.fired }
}

/** First Copy click on a fix (manipulation check, never a success metric). */
export function observeFixCopied(state: MetricsState): { state: MetricsState; fire: MetricName[] } {
  const { fire, fired } = rememberOnce(state, ['fix_copied'])
  return { state: { ...state, fired }, fire }
}
