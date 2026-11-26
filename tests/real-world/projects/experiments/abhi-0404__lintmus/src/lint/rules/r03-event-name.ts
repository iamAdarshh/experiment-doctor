import { levenshtein } from '../levenshtein.ts'
import { findCalls, makeFinding, mentionsFlagsmith, PLACEHOLDER_METRIC } from './shared.ts'
import type { Finding, Rule } from '../types.ts'

const WHY_MISMATCH =
  'The event name does not exactly match a metric name, so Flagsmith ignores the event without any error. The metric stays at zero.'
const WHY_PLACEHOLDER =
  'YOUR_METRIC_NAME is a placeholder. No metric has this name, so every event sent with it is silently ignored.'
const WHY_STYLE =
  'No metric list was given, so Lintmus cannot compare names. This name is not lower snake_case, which is how metric names usually look; check it matches the metric in Flagsmith character for character.'

export const r03: Rule = {
  id: 'r03',
  title: 'Event name does not match a metric',
  languages: ['js', 'py'],
  check(ctx) {
    if (!mentionsFlagsmith(ctx)) return []
    const fn = ctx.language === 'js' ? 'trackEvent' : 'track_event'
    const call = (name: string) =>
      ctx.language === 'js' ? `flagsmith.trackEvent('${name}')` : `flagsmith.track_event("${name}")`
    const out: Finding[] = []
    const seen = new Set<string>()
    for (const c of findCalls(ctx, fn, true)) {
      const m = /^\s*(['"`])([^'"`\\]*)\1/.exec(c.args)
      if (!m) continue // a variable or expression: cannot judge it
      const name = m[2]!
      // Finding ids are keyed on the fix target, not on the typed name, so a rename in progress
      // ('Checkout_Completed' to 'checkout_Completed') stays the same finding instead of a "new" one.
      const push = (id: string, make: (id: string) => Finding) => {
        if (seen.has(id)) return
        seen.add(id)
        out.push(make(id))
      }

      if (name === PLACEHOLDER_METRIC) {
        const to = ctx.metricNames[0] ?? PLACEHOLDER_METRIC
        const note = ctx.metricNames.length ? '' : ' // replace with the exact metric name from Flagsmith'
        push('r03:placeholder', (id) =>
          makeFinding({ id, ruleId: 'r03', title: 'Placeholder event name left in', line: c.line, why: WHY_PLACEHOLDER, fix: call(to) + note }),
        )
        continue
      }
      if (ctx.metricNames.length > 0) {
        if (ctx.metricNames.includes(name)) continue
        const close = ctx.metricNames.find(
          (metric) => name.toLowerCase() === metric.toLowerCase() || levenshtein(name, metric) <= 2,
        )
        if (close) {
          push(`r03:mismatch:${close}`, (id) =>
            makeFinding({ id, ruleId: 'r03', title: `Event "${name}" does not match metric "${close}"`, line: c.line, why: WHY_MISMATCH, fix: call(close) }),
          )
        }
        continue
      }
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        const suggestion = name
          .trim()
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/[\s-]+/g, '_')
          .toLowerCase()
        push(`r03:style:${suggestion}`, (id) =>
          makeFinding({ id, ruleId: 'r03', severity: 'possible', title: `Possible issue: event name "${name}"`, line: c.line, why: WHY_STYLE, fix: call(suggestion) }),
        )
      }
    }
    return out
  },
}
