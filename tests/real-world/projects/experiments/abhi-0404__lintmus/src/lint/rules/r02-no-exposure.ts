import { findCalls, firstMetric, makeFinding, mentionsFlagsmith, usesEvents } from './shared.ts'
import type { Rule } from '../types.ts'

const WHY =
  'A plain flag read does not record an exposure. Without an exposure event the experiment cannot tell who saw which version, so conversions have nothing to be compared against.'

const TITLE = 'Flag is read without recording an exposure'

export const r02: Rule = {
  id: 'r02',
  title: TITLE,
  languages: ['js', 'py'],
  check(ctx) {
    // Only files that already use events are treated as experiment code (avoids flagging plain flag users).
    if (!mentionsFlagsmith(ctx) || !usesEvents(ctx)) return []
    if (ctx.language === 'js') {
      if (/\b(getExperimentFlag|trackExposureEvent)\b/.test(ctx.code)) return []
      const read = findCalls(ctx, 'getValue|hasFeature', true).find((c) => /^\s*['"`]/.test(c.args))
      if (!read) return []
      const flag = /['"`]([^'"`]+)['"`]/.exec(read.args)?.[1] ?? 'my_flag'
      const fix = `// Read the experiment flag once flags are loaded for the identity. This records the exposure
// when the identity is enrolled in the running experiment and the value came from the server.
const flag = flagsmith.getExperimentFlag('${flag}')
// If you read the value another way, record it once, and only for a server value:
// flagsmith.trackExposureEvent('${flag}', { value: flag?.variant })
flagsmith.trackEvent('${firstMetric(ctx)}')`
      return [makeFinding({ id: 'r02', ruleId: 'r02', title: TITLE, line: read.line, why: WHY, fix })]
    }
    if (/\b(get_experiment_flag|track_exposure_event)\b/.test(ctx.code)) return []
    const read = findCalls(ctx, 'get_feature_value|is_feature_enabled|get_value', true).find((c) => /^\s*['"]/.test(c.args))
    if (!read) return []
    const flag = /['"]([^'"]+)['"]/.exec(read.args)?.[1] ?? 'my_flag'
    // Python experiment method names are not confirmed (see docs/sdk-facts.md).
    const fix = `# Record the exposure for the identity that saw the flag (check the method name for your SDK version).
flag = flagsmith.get_experiment_flag("${flag}", identifier=user_id)
flagsmith.track_event("${firstMetric(ctx)}", identifier=user_id)`
    return [makeFinding({ id: 'r02', ruleId: 'r02', title: TITLE, line: read.line, why: WHY, fix })]
  },
}
