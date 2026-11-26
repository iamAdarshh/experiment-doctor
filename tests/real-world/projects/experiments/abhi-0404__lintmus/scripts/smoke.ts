// Smoke experiment traffic for the `sim` environment: ~120 identities through the real Node SDK.
// Run: pnpm smoke   (node --env-file=.env scripts/smoke.ts [--n 120] [--seed 7] [--rate 10])
//
// Learns the Flagsmith UI behaviour we depend on:
//   - finding_fixed_clean converts for about 30% of identities in both arms (above the floor).
//   - fix_copied fires for exactly 2 identities, both in the fix_first arm (below the 5-conversion
//     floor), to see how a below-floor metric is displayed.
// Exposure comes from getExperimentFlag, which records it only when the identity is enrolled in a
// RUNNING experiment on the flag. Create and start the experiment in `sim` first, then run this.
import { loadConfig, makeClient, requireEnv, sleep } from './lib.ts'
import { mulberry32 } from './sim/prng.ts'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? Number(process.argv[i + 1]) : fallback
}

const n = arg('n', 120)
const seed = arg('seed', 7)
const perSecond = arg('rate', 10)
const CONVERSION = 0.3
const BELOW_FLOOR_EVENTS = 2

const config = loadConfig()
const client = makeClient(requireEnv('FLAGSMITH_ENV_KEY_SIM'), config.control.value)
const rand = mulberry32(seed)

console.log(`smoke: seed=${seed} n=${n} env=sim flag=${config.flag}`)

const arms: Record<string, { exposed: number; converted: number; copied: number }> = {}
let enrolled = 0
let copiedSent = 0

for (let i = 1; i <= n; i++) {
  const identity = `smoke-${String(i).padStart(3, '0')}`
  const flag = await client.getExperimentFlag(config.flag, identity)
  const arm = String(flag.value ?? 'unknown')
  const a = (arms[arm] ??= { exposed: 0, converted: 0, copied: 0 })
  // flag.isDefault is true when the value came from the default handler, not the server.
  if (!flag.isDefault) {
    if ('experiment' in flag && flag.experiment?.inExperiment) enrolled++
    a.exposed++
  }
  if (rand() < CONVERSION) {
    client.trackEvent('finding_fixed_clean', { identifier: identity })
    a.converted++
  }
  if (arm === config.variation.value && copiedSent < BELOW_FLOOR_EVENTS) {
    client.trackEvent('fix_copied', { identifier: identity })
    a.copied++
    copiedSent++
  }
  await sleep(1000 / perSecond)
}

await client.close(15_000)

console.log(`identities enrolled in a running experiment: ${enrolled} of ${n}`)
if (enrolled === 0) console.log('WARNING: none enrolled. Is the experiment started in `sim`? No exposures were recorded.')
console.table(arms)
console.log('Next: refresh results in the Flagsmith dashboard (max once per 5 minutes) and note how fix_copied is shown.')
