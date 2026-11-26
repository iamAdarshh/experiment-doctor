// Simulated traffic for one world through the real Flagsmith Node SDK, or an offline dry run.
//   pnpm simulate -- --world aa|mde|harm|srm --seed 42 --n 3000 --env sim [--rate 10] [--drop 0.1] [--dry-run]
// --dry-run needs no keys and no network: it prints the expected arm counts and a conversion summary.
// Live: key from .env as FLAGSMITH_ENV_KEY_<ENV> (--env sim-aa reads FLAGSMITH_ENV_KEY_SIM_AA). The `real`
// environment is refused on purpose. Run ONLY after the experiment for that world is created and started.
//
// Events are sent exactly as the app sends them (experiment.config.json names): one exposure per identity
// (trackExposureEvent on the flag value + experiment_id, like getExperimentFlag would) when the identity is
// enrolled in a running experiment, then the metric events via trackEvent, then flushEvents() and close().
// The model only decides behaviour; the ARM always comes from Flagsmith (dry run: a seeded 50/50 coin).
// The simulation validates the design and the decision rule; it says nothing about developers.
import { Flag } from '@flagsmith/nodejs'
import { loadConfig, makeClient, sleep } from './lib.ts'
import {
  addToSummary, ARMS, dryRunArm, emptySummary, expectedRates, simulateUser, WORLDS, worldParams,
  type Arm, type Summary, type World,
} from './sim/model.ts'

const METRICS = ['finding_fixed_clean', 'new_finding_after_edit', 'finding_resolved', 'fix_copied'] as const

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined
}
function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}
function numOpt(name: string, fallback: number): number {
  const v = opt(name)
  if (v === undefined) return fallback
  const x = Number(v)
  if (!Number.isFinite(x)) fail(`--${name} must be a number, got "${v}"`)
  return x
}

const world = opt('world') as World | undefined
if (!world || !WORLDS.includes(world)) fail(`--world must be one of ${WORLDS.join(', ')}`)
const seed = numOpt('seed', 42)
const n = numOpt('n', 3000)
if (!Number.isInteger(n) || n < 1) fail('--n must be a positive integer')
const rate = numOpt('rate', 10)
const dryRun = process.argv.includes('--dry-run')
const env = opt('env')
const params = worldParams(world)
const dropOverride = opt('drop')
if (dropOverride !== undefined) {
  const d = Number(dropOverride)
  if (!(d >= 0 && d <= 1)) fail('--drop must be between 0 and 1')
  params.dropFixFirstExposure = d
}
const config = loadConfig()
const prefix = `sim-${world}-s${seed}-`
const identityFor = (i: number) => `${prefix}${String(i + 1).padStart(5, '0')}`

console.log(`simulate: world=${world} seed=${seed} n=${n} env=${dryRun ? '(dry run)' : env ?? '(missing)'} flag=${config.flag} identities=${prefix}00001..${String(n).padStart(5, '0')} fix_first exposure drop=${params.dropFixFirstExposure}`)

function printSummary(s: Summary, note: string): void {
  console.log(note)
  const rows: Record<string, Record<string, string | number>> = {}
  for (const arm of ARMS) {
    const a = s[arm]
    const rowFor = (k: (typeof METRICS)[number]) => `${a[k]} (${a.exposures > 0 ? ((100 * a[k]) / a.exposures).toFixed(1) : '0.0'}%)`
    rows[arm] = { assigned: a.assigned, exposures: a.exposures }
    for (const m of METRICS) rows[arm][m] = rowFor(m)
  }
  console.table(rows)
  const c = s.explain_first
  const v = s.fix_first
  if (c.exposures > 0 && v.exposures > 0 && c.finding_fixed_clean > 0) {
    const lift = v.finding_fixed_clean / v.exposures / (c.finding_fixed_clean / c.exposures) - 1
    console.log(`clean-fix relative lift (fix_first vs explain_first): ${(100 * lift).toFixed(1)}%   guardrail diff: ${((100 * v.new_finding_after_edit) / v.exposures - (100 * c.new_finding_after_edit) / c.exposures).toFixed(2)} points`)
  }
}

if (dryRun) {
  const s = emptySummary()
  for (let i = 0; i < n; i++) addToSummary(s, simulateUser(world, seed, i, dryRunArm(seed, i), params))
  console.log(`dry run: no network, no Flagsmith. Expected arm counts at a 50/50 split: ${n / 2} / ${n / 2}`)
  printSummary(s, 'Seeded dry-run assignment (a coin per identity; Flagsmith hashes identities instead):')
  const e = expectedRates(world, 100_000, params)
  console.log('Model expectation (Monte Carlo, 100,000 users, rates among exposed):')
  console.table(
    Object.fromEntries(ARMS.map((arm) => [arm, Object.fromEntries(METRICS.map((m) => [m, `${(100 * e[arm][m]).toFixed(1)}%`]))])),
  )
  if (params.dropFixFirstExposure > 0) {
    console.log(`SRM world: ${(100 * params.dropFixFirstExposure).toFixed(0)}% of fix_first exposures are dropped, so about ${Math.round((n / 2) * (1 - params.dropFixFirstExposure))} fix_first vs ${n / 2} explain_first exposures reach Flagsmith.`)
  }
  process.exit(0)
}

if (!env) fail('--env is required for a live run (for example --env sim). Use --dry-run to run without Flagsmith.')
if (env.toLowerCase() === 'real') fail('Refusing to simulate into the `real` environment.')
const keyVar = `FLAGSMITH_ENV_KEY_${env.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
const key = process.env[keyVar]
if (!key) fail(`Missing ${keyVar}. Copy .env.example to .env and set it (a server-side environment key for "${env}").`)

const client = makeClient(key, config.control.value)
const summary = emptySummary()
let defaults = 0
let notEnrolled = 0
let unknownArm = 0
let errors = 0

try {
  for (let i = 0; i < n; i++) {
    const identity = identityFor(i)
    try {
      const flags = await client.getIdentityFlags(identity)
      const flag = flags.getFlag(config.flag)
      if (flag.isDefault) {
        // Default handler value: the app sends no exposure and no metrics for these, so the simulator sends none either.
        defaults++
        continue
      }
      const arm: Arm | null = flag.value === config.variation.value ? 'fix_first' : flag.value === config.control.value ? 'explain_first' : null
      if (arm === null) {
        unknownArm++
        continue
      }
      const user = simulateUser(world, seed, i, arm, params)
      const real = flag instanceof Flag ? flag : undefined
      const experiment = real?.experiment
      const enrolled = Boolean(experiment?.inExperiment) && flag.enabled
      if (!enrolled) notEnrolled++
      // Exposure first (the app fires it when the first finding card renders), then metrics, as in the app.
      const sendExposure = enrolled && user.outcome.exposureSent
      if (sendExposure && experiment) {
        client.trackExposureEvent(config.flag, { identifier: identity, value: real?.variant, metadata: { experiment_id: experiment.id } })
      }
      for (const m of METRICS) if (user.outcome[m]) client.trackEvent(m, { identifier: identity })
      addToSummary(summary, { ...user, outcome: { ...user.outcome, exposureSent: sendExposure } })
    } catch (err) {
      errors++
      if (errors <= 5) console.error(`identity ${identity}: ${(err as Error).message}`)
    }
    if ((i + 1) % 500 === 0) console.log(`  ${i + 1}/${n} identities`)
    if (rate > 0) await sleep(1000 / rate)
  }
  await client.flushEvents()
} finally {
  await client.close(30_000)
}

console.log(`done: ${n} identities, defaults (no exposure, no metrics) ${defaults}, not enrolled in a running experiment ${notEnrolled}, unknown arm ${unknownArm}, errors ${errors}`)
if (notEnrolled > 0 || defaults > 0) console.log('WARNING: some identities were not exposed. Is the experiment for this world started in this environment?')
printSummary(summary, 'Sent (counts of identities with an exposure event; metrics are counted over those only):')
console.log('Next: refresh results in the Flagsmith dashboard (at most once per 5 minutes).')
