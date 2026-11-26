// Sends one event for identity "prework-test" to every Flagsmith environment that has a key,
// so the managed warehouse sees its first event (and any first-event latency) before the
// hackathon starts. Run: pnpm ping   (node --env-file=.env scripts/prework-ping.ts)
import { loadConfig, makeClient } from './lib.ts'

const IDENTITY = 'prework-test'
const ENVS = ['REAL', 'SIM', 'SIM_AA', 'SIM_MDE', 'SIM_HARM', 'SIM_SRM']

const config = loadConfig()
let sent = 0
let failed = 0

for (const env of ENVS) {
  const name = `FLAGSMITH_ENV_KEY_${env}`
  const key = process.env[name]
  if (!key) {
    console.log(`skip  ${env.toLowerCase()}  (${name} not set)`)
    continue
  }
  try {
    const client = makeClient(key, config.control.value)
    client.trackEvent('prework_ping', { identifier: IDENTITY, metadata: { source: 'prework-ping' } })
    // close() flushes the buffer, waits up to 10 s and never rejects. A dropped batch is logged by the SDK.
    await client.close(10_000)
    console.log(`sent  ${env.toLowerCase()}  event=prework_ping identity=${IDENTITY}`)
    sent++
  } catch (err) {
    console.error(`FAIL  ${env.toLowerCase()}  ${(err as Error).message}`)
    failed++
  }
}

console.log(`done: ${sent} environment(s) pinged, ${failed} failed. Check each environment's warehouse/events view.`)
if (sent === 0 || failed > 0) process.exitCode = 1
