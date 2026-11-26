import { findCalls, isFlagsmithReceiver, makeFinding, mentionsFlagsmith, pythonConstructors } from './shared.ts'
import type { Rule } from '../types.ts'

const JS_FIX = `await flagsmith.init({
  environmentID: '<client-side environment key>',
  identity: userId,
  enableEvents: true, // without this trackEvent and trackExposureEvent do nothing
})`

const PY_FIX = `flagsmith = Flagsmith(
    environment_key="<server-side environment key>",
    enable_events=True,  # without this no event is ever sent
)`

const WHY =
  'With events switched off, the SDK silently ignores every event call. The experiment keeps showing "Collecting data" and nothing is recorded.'

export const r01: Rule = {
  id: 'r01',
  title: 'enableEvents is missing in the SDK init',
  languages: ['js', 'py'],
  check(ctx) {
    if (!mentionsFlagsmith(ctx)) return []
    if (ctx.language === 'js') {
      const inits = findCalls(ctx, 'init', true).filter((c) => isFlagsmithReceiver(ctx, c.receiver))
      const bad = inits.find((c) => !/\benableEvents\s*:\s*true\b/.test(c.args))
      if (!bad) return []
      return [
        makeFinding({ id: 'r01', ruleId: 'r01', title: 'enableEvents is missing in the SDK init', line: bad.line, why: WHY, fix: JS_FIX }),
      ]
    }
    const bad = pythonConstructors(ctx).find((c) => !/\benable_events\s*=\s*True\b/.test(c.args))
    if (!bad) return []
    return [
      makeFinding({ id: 'r01', ruleId: 'r01', title: 'enable_events=True is missing in the SDK init', line: bad.line, why: WHY, fix: PY_FIX }),
    ]
  },
}
