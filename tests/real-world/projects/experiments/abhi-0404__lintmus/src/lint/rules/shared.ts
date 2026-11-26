import { callArgs, lineOf } from '../strip.ts'
import type { Finding, LintContext, Severity } from '../types.ts'

/** Placeholder written into fix snippets when the user gave no metric names. */
export const PLACEHOLDER_METRIC = 'YOUR_METRIC_NAME'

/**
 * Docs base. Page-level anchors are confirmed with Flagsmith staff in Phase 2
 * (docs/rule-review.md); until then every rule links to the experimentation docs root.
 */
export const DOCS_EXPERIMENTATION = 'https://docs.flagsmith.com/experimentation'

export function firstMetric(ctx: LintContext): string {
  return ctx.metricNames[0] ?? PLACEHOLDER_METRIC
}

export interface Call {
  name: string
  /** Receiver text before the dot, when there is one. */
  receiver: string | null
  offset: number
  line: number
  args: string
}

/** Find calls such as `x.name(...)` or `name(...)` and capture their argument text. */
export function findCalls(ctx: LintContext, namePattern: string, withReceiver: boolean): Call[] {
  const re = withReceiver
    ? new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\s*\.\s*(${namePattern})\s*\(`, 'g')
    : new RegExp(String.raw`\b(${namePattern})\s*\(`, 'g')
  const calls: Call[] = []
  for (const m of ctx.code.matchAll(re)) {
    const open = m.index + m[0].length - 1
    const args = callArgs(ctx.code, open)
    if (args === null) continue
    calls.push({
      name: withReceiver ? m[2]! : m[1]!,
      receiver: withReceiver ? m[1]! : null,
      offset: m.index,
      line: lineOf(ctx.code, m.index),
      args,
    })
  }
  return calls
}

export function mentionsFlagsmith(ctx: LintContext): boolean {
  return /flagsmith/i.test(ctx.code)
}

export function makeFinding(
  base: Pick<Finding, 'id' | 'ruleId' | 'title' | 'line' | 'why' | 'fix'> & { severity?: Severity },
): Finding {
  return { severity: 'error', docsUrl: DOCS_EXPERIMENTATION, ...base }
}

/** Does the code use any events feature (a sign the file is meant to run an experiment)? */
export function usesEvents(ctx: LintContext): boolean {
  return ctx.language === 'js'
    ? /\b(enableEvents|trackEvent|trackExposureEvent|getExperimentFlag)\b/.test(ctx.code)
    : /\b(enable_events|track_event|track_exposure_event|get_experiment_flag)\b/.test(ctx.code)
}

/** Names bound with createFlagsmithInstance(), so `fs.init(...)` is recognised too. */
export function instanceNames(ctx: { code: string }): Set<string> {
  const names = new Set<string>()
  for (const m of ctx.code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createFlagsmithInstance\s*\(/g)) {
    names.add(m[1]!)
  }
  return names
}

/** Is this `x.init(...)` or `x.identify(...)` call made on a Flagsmith client? */
export function isFlagsmithReceiver(ctx: LintContext, receiver: string | null): boolean {
  return /flagsmith/i.test(receiver ?? '') || instanceNames(ctx).has(receiver ?? '')
}

/** Python constructor calls `Flagsmith(...)`, excluding `class Flagsmith(...)` and `def Flagsmith(...)`. */
export function pythonConstructors(ctx: LintContext): Call[] {
  return findCalls(ctx, 'Flagsmith', false).filter(
    (c) => !/\b(class|def)\s+$/.test(ctx.code.slice(Math.max(0, c.offset - 8), c.offset)),
  )
}

/** The literal event name in a trackEvent / track_event argument list, or null for a variable or expression. */
export function literalEventName(args: string): string | null {
  return /^\s*(['"`])([^'"`\\]*)\1/.exec(args)?.[2] ?? null
}
