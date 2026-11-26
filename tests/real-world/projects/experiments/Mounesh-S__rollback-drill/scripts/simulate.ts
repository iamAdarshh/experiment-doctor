// Sends simulated players through the real Flagsmith SDK to validate the pipeline.
// DEVELOPMENT ONLY: it refuses any key not on the Development allowlist. Simulated data is never reported as
// experiment results.
//
//   SIM_ENV_KEY=<dev key> node scripts/simulate.ts --run aa-1 --users 300 --control 0.5 --treatment 0.5

import { createFlagsmithInstance } from '@flagsmith/flagsmith/isomorphic'
import { parseArgs } from 'node:util'
import { EVENT } from '../src/game/events.ts'
import { FLAG, LAYOUT_TREATMENT_VARIANT } from '../src/flags/config.ts'
import { simulatePlayer, type Arm, type SimRates } from './sim-model.ts'

// Allowlist, not denylist: simulated traffic may only ever go to these environments.
const DEVELOPMENT_KEYS = new Set(['GvtEUtEy3rG2h6riwpdmeo'])

const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    users: { type: 'string', default: '300' },
    control: { type: 'string', default: '0.45' },
    treatment: { type: 'string', default: '0.65' },
    concurrency: { type: 'string', default: '10' },
  },
})

const envKey = process.env.SIM_ENV_KEY ?? ''
if (!envKey) throw new Error('Set SIM_ENV_KEY to the Development client-side key.')
if (!DEVELOPMENT_KEYS.has(envKey)) throw new Error('Refusing: SIM_ENV_KEY is not an allowlisted Development key.')
if (!values.run || !/^[a-z0-9-]{2,32}$/.test(values.run)) throw new Error('Pass --run <label>, e.g. --run aa-1')

const users = Number(values.users)
const rates: SimRates = {
  correct: { control: Number(values.control), treatment: Number(values.treatment) },
  submit: 0.92,
  tabLeave: 0.05,
}

const tally: Record<Arm, { players: number; conversions: number; notEnrolled: number }> = {
  control: { players: 0, conversions: 0, notEnrolled: 0 },
  treatment: { players: 0, conversions: 0, notEnrolled: 0 },
}

async function runPlayer(i: number): Promise<void> {
  const client = createFlagsmithInstance()
  const identifier = `sim-${values.run}-${String(i).padStart(5, '0')}`
  await client.init({ environmentID: envKey, identity: identifier, enableEvents: true, eventProcessorConfig: { flushInterval: 60_000 } })

  const flag = client.getExperimentFlag(FLAG.layout) // records the exposure, like the app
  const arm: Arm = flag?.variant === LAYOUT_TREATMENT_VARIANT ? 'treatment' : 'control'
  tally[arm].players++
  if (!flag?.experiment?.inExperiment) tally[arm].notEnrolled++

  const o = simulatePlayer(i * 2654435761 + values.run!.length, arm, rates)
  if (o.tabLeft) client.trackEvent(EVENT.tabLeft)
  if (o.submitted) client.trackEvent(EVENT.decisionSubmitted, { value: o.decisionMs })
  if (o.converts) {
    client.trackEvent(EVENT.correctFirstRollback)
    tally[arm].conversions++
  }
  await client.close(10_000) // sends everything buffered
}

const queue = Array.from({ length: users }, (_, i) => i + 1)
const workers = Array.from({ length: Number(values.concurrency) }, async () => {
  for (let i = queue.shift(); i !== undefined; i = queue.shift()) await runPlayer(i)
})
await Promise.all(workers)

console.log(`run ${values.run}: ${users} simulated players (Development)`)
for (const arm of ['control', 'treatment'] as const) {
  const t = tally[arm]
  const rate = t.players ? ((100 * t.conversions) / t.players).toFixed(1) : '0.0'
  console.log(`  ${arm.padEnd(9)} players ${t.players}  conversions ${t.conversions}  rate ${rate}%  not-enrolled ${t.notEnrolled}`)
}
