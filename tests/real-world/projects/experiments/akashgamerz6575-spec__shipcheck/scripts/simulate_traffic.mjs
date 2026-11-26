#!/usr/bin/env node
/**
 * SYNTHETIC traffic verification for the ShipCheck Flagsmith experiment.
 *
 * This script exists to prove the experiment pipeline works end to end:
 * exposures are recorded for unique identities and `fix_action_completed`
 * conversions are tracked and flushed. It does NOT represent real user traffic
 * and must never be presented as such in the Flagsmith dashboard.
 *
 * Usage:
 *   node scripts/simulate_traffic.mjs --yes            # 200 users
 *   node scripts/simulate_traffic.mjs --yes --users=50
 *   node scripts/simulate_traffic.mjs --dry-run        # no network calls
 *
 * The environment key is read from (in order):
 *   FLAGSMITH_ENV_KEY, VITE_FLAGSMITH_ENV_KEY, .env, flagsmith.env
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Flagsmith } from '@flagsmith/nodejs'

const FLAG = 'fix_workflow_mode'
const EVENT = 'fix_action_completed'
const BASELINE_RATE = 0.28 // control
const VARIANT_RATE = 0.42 // guided_fix
const TARGET_EXPOSURES = { control: 0.5, guided_fix: 0.5 }

const args = process.argv.slice(2)
const confirmed = args.includes('--yes') || process.env.CONFIRM_SIMULATED_TRAFFIC === '1'
const dryRun = args.includes('--dry-run')
const usersArg = args.find((arg) => arg.startsWith('--users='))
const totalUsers = usersArg ? Number.parseInt(usersArg.split('=')[1], 10) : 200

if (!Number.isFinite(totalUsers) || totalUsers < 1 || totalUsers > 5000) {
  console.error('Invalid --users value. Use a number between 1 and 5000.')
  process.exit(1)
}

function loadEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName)
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}

const dotenv = { ...loadEnvFile('flagsmith.env'), ...loadEnvFile('.env') }
const envKey =
  process.env.FLAGSMITH_ENV_KEY ||
  process.env.VITE_FLAGSMITH_ENV_KEY ||
  dotenv.FLAGSMITH_ENV_KEY ||
  dotenv.VITE_FLAGSMITH_ENV_KEY ||
  ''

function banner() {
  const line = '='.repeat(68)
  console.log(line)
  console.log('  SHIPCHECK — SYNTHETIC TRAFFIC VERIFICATION')
  console.log(line)
  console.log('  This run generates SIMULATED identities and events to verify the')
  console.log('  Flagsmith experiment pipeline. It is NOT real user traffic and must')
  console.log('  be reported separately from live experiment results.')
  console.log('')
  console.log(`  Flag:   ${FLAG}`)
  console.log(`  Event:  ${EVENT}`)
  console.log(`  Users:  ${totalUsers} unique identities (sim_user_<n>)`)
  console.log(`  Rates:  control ${(BASELINE_RATE * 100).toFixed(0)}% / guided_fix ${(VARIANT_RATE * 100).toFixed(0)}% (seeded)`)
  console.log(line)
  console.log('')
}

banner()

if (dryRun) {
  const exposures = { control: Math.round(totalUsers * TARGET_EXPOSURES.control), guided_fix: Math.round(totalUsers * TARGET_EXPOSURES.guided_fix) }
  console.log('Dry run — no network calls made. Expected exposure split:', exposures)
  process.exit(0)
}

if (!confirmed) {
  console.log('Refusing to send synthetic events without explicit confirmation.')
  console.log('Re-run with:  node scripts/simulate_traffic.mjs --yes')
  console.log('')
  console.log('Why: synthetic events pollute real experiment results if mixed with')
  console.log('production traffic. Keep verification runs clearly labelled.')
  process.exit(0)
}

if (!envKey || envKey === 'your_client_side_environment_key') {
  console.error('Missing Flagsmith environment key.')
  console.error('Set VITE_FLAGSMITH_ENV_KEY in .env (client-side key) or export FLAGSMITH_ENV_KEY.')
  console.error('Provision the experiment first with: bash scripts/setup_flagsmith.sh')
  process.exit(1)
}

/** Deterministic PRNG so verification runs are reproducible. */
function mulberry32(seed) {
  return function next() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const runId = `sim-${new Date().toISOString().replace(/[:.]/g, '-')}`
const random = mulberry32(0x5c1ec7)

const flagsmith = new Flagsmith({
  environmentKey: envKey,
  enableEvents: true,
  retries: 2,
  requestTimeoutSeconds: 15,
  eventProcessorConfig: {
    flushInterval: 0, // explicit flushes only
    maxBuffer: 5000,
  },
})

const tally = {
  control: { exposures: 0, conversions: 0 },
  guided_fix: { exposures: 0, conversions: 0 },
  other: { exposures: 0, conversions: 0 },
}
let notEnrolled = 0

console.log('Recording exposures and conversions…')

try {
  for (let n = 1; n <= totalUsers; n += 1) {
    const identifier = `sim_user_${n}`
    const flag = await flagsmith.getExperimentFlag(FLAG, identifier)
    const enrolled = Boolean(flag?.experiment?.inExperiment)

    if (!enrolled) {
      // getExperimentFlag only records an exposure for enrolled identities.
      // Tracking a conversion without an exposure would corrupt the metric.
      notEnrolled += 1
      continue
    }

    const variantKey = typeof flag?.variant === 'string' ? flag.variant : null
    const rawValue = flag?.value
    const variant =
      variantKey === 'guided_fix' || rawValue === 'guided_fix'
        ? 'guided_fix'
        : variantKey === 'control' || rawValue === 'control'
          ? 'control'
          : 'other'

    tally[variant].exposures += 1

    const conversionRate = variant === 'guided_fix' ? VARIANT_RATE : BASELINE_RATE
    if (random() < conversionRate) {
      flagsmith.trackEvent(EVENT, {
        identifier,
        value: 1,
        metadata: {
          variant,
          simulated: true,
          run_id: runId,
          source: 'scripts/simulate_traffic.mjs',
        },
      })
      tally[variant].conversions += 1
    }

    if (n % 50 === 0) {
      console.log(`  … ${n}/${totalUsers} identities evaluated`)
    }
  }

  console.log('')
  console.log('Flushing buffered events (flagsmith.flushEvents())…')
  await flagsmith.flushEvents()
  console.log('Flush complete. Closing client (flagsmith.close())…')
  await flagsmith.close(10000)
} catch (error) {
  console.error('')
  console.error('Traffic simulation failed:', error instanceof Error ? error.message : error)
  try {
    await flagsmith.close(5000)
  } catch {
    // ignore
  }
  process.exit(1)
}

const rows = ['control', 'guided_fix', 'other']
  .filter((key) => tally[key].exposures > 0)
  .map((key) => {
    const { exposures, conversions } = tally[key]
    const rate = exposures > 0 ? (conversions / exposures) * 100 : 0
    return { key, exposures, conversions, rate }
  })

console.log('')
console.log('SYNTHETIC RESULTS (pipeline sanity check only)')
console.log('---------------------------------------------------------------')
for (const row of rows) {
  console.log(
    `  ${row.key.padEnd(11)} exposures=${String(row.exposures).padStart(4)}  conversions=${String(
      row.conversions,
    ).padStart(4)}  rate=${row.rate.toFixed(1)}%`,
  )
}
console.log('---------------------------------------------------------------')
if (notEnrolled > 0) {
  console.log(`  not enrolled: ${notEnrolled} identities (no exposure, no conversion)`)
}
console.log(`  run_id: ${runId}`)
console.log('  Every event above is labelled simulated=true in its metadata.')

const totalExposures = rows.reduce((sum, row) => sum + row.exposures, 0)
if (totalExposures === 0) {
  console.log('')
  console.log('WARNING: 0 enrolled exposures were returned.')
  console.log('Check that the experiment is running and the guided_fix variation has a key.')
  process.exitCode = 2
}
console.log('')
console.log('Next: wait ~60s, then refresh Bayesian results:')
console.log('  flagsmith api "api/v1/environments/<ENV_KEY>/experiments/<EXPERIMENT_ID>/results/refresh/" --method POST')
console.log('  flagsmith api "api/v1/environments/<ENV_KEY>/experiments/<EXPERIMENT_ID>/results/"')
console.log('')
console.log('Done. This was synthetic pipeline verification, not live traffic.')
