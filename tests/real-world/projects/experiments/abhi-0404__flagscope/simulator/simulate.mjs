// Simulated traffic for the paypal_button experiment, sent with the real @flagsmith/nodejs SDK.
// All users and events are SIMULATED (identities are prefixed "sim-"); nothing here is real customer data.
//
//   pnpm --dir simulator simulate --users 300              natural split from Flagsmith (about a third each)
//   pnpm --dir simulator simulate --users 300 --skew 70    70 percent of exposures go to control: triggers SRM
//
// Deterministic: the same --seed always produces the same identities, the same skew choices and the same
// conversions. Use a different --seed (or a different --skew) for new users; an identity that was already exposed
// is only ever counted once by Flagsmith.
//
// Defaults come from stack/.generated/state.json when it exists (environment key, master key), so a local
// stack needs no arguments. The master key is only used for POST .../results/refresh/ and is never printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Flagsmith } from '@flagsmith/nodejs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Target share per arm. skew = percent of exposures forced onto control, the rest is split evenly. */
export function armWeights(arms, skew) {
  if (!skew) return Object.fromEntries(arms.map((a) => [a, 1 / arms.length]));
  const rest = (100 - skew) / 100 / (arms.length - 1);
  return Object.fromEntries(arms.map((a, i) => [a, i === 0 ? skew / 100 : rest]));
}

export function pickArm(weights, r) {
  let acc = 0;
  for (const [arm, w] of Object.entries(weights)) {
    acc += w;
    if (r < acc) return arm;
  }
  return Object.keys(weights).at(-1);
}

/** Conversion odds per arm: control = base, variant_b gets the full relative lift, variant_a a third of it. */
export function conversionRates(base, lift) {
  return { control: base, variant_a: base * (1 + lift / 3), variant_b: base * (1 + lift) };
}

function loadState() {
  const i = process.argv.indexOf('--state');
  const file = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(here, '..', 'stack', '.generated', 'state.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const state = loadState();
  const { values } = parseArgs({
    options: {
      users: { type: 'string', default: '200' },
      skew: { type: 'string', default: '0' },
      lift: { type: 'string', default: '0.6' },
      base: { type: 'string', default: '0.10' },
      seed: { type: 'string', default: '1' },
      env: { type: 'string', default: process.env.FLAGSMITH_ENV_KEY ?? state.envKey ?? '' },
      url: { type: 'string', default: process.env.FLAGSMITH_URL ?? 'http://localhost:8000' },
      feature: { type: 'string', default: 'paypal_button' },
      event: { type: 'string', default: 'checkout_completed' },
      experiment: { type: 'string', default: String(state.experiment ?? '') },
      prefix: { type: 'string', default: 'sim' },
      state: { type: 'string' }, // state.json of another stack (for example stack/.generated-test/state.json)
      'no-refresh': { type: 'boolean', default: false },
    },
  });
  const users = Number(values.users);
  const skew = Number(values.skew);
  const seed = Number(values.seed);
  if (!Number.isInteger(users) || users < 1) throw new Error('--users must be a positive integer');
  if (!(skew === 0 || (skew > 0 && skew < 100))) throw new Error('--skew must be 0 (off) or a number between 1 and 99');
  if (!values.env) throw new Error('no environment key: pass --env, set FLAGSMITH_ENV_KEY, or start the stack so stack/.generated/state.json exists');

  const arms = ['control', 'variant_a', 'variant_b'];
  const weights = armWeights(arms, skew);
  const rates = conversionRates(Number(values.base), Number(values.lift));
  const rng = mulberry32(seed);
  const tag = skew ? `${values.prefix}-${seed}-skew${skew}` : `${values.prefix}-${seed}`;

  const flagsmith = new Flagsmith({
    environmentKey: values.env,
    apiUrl: `${values.url}/api/v1/`,
    enableEvents: true,
    eventProcessorConfig: { eventsApiUrl: `${values.url}/api/`, flushInterval: 0 },
  });

  // Which arm would this identity get? getIdentityFlags does not record an exposure event, getExperimentFlag does.
  const probe = async (id) => String((await flagsmith.getIdentityFlags(id)).getFeatureValue(values.feature));

  const seen = Object.fromEntries(arms.map((a) => [a, 0]));
  const converted = Object.fromEntries(arms.map((a) => [a, 0]));
  let probes = 0;
  let candidate = 0;
  for (let i = 0; i < users; i++) {
    const wanted = skew ? pickArm(weights, rng()) : null;
    let id = `${tag}-${skew ? candidate++ : i}`;
    if (skew) {
      // Skew mode: walk candidate identities until Flagsmith would serve the arm we want (about 3 probes per user).
      for (let tries = 0; ; tries++) {
        probes++;
        if ((await probe(id)) === wanted) break;
        if (tries > 200) throw new Error(`could not find an identity that gets ${wanted}; is the experiment running?`);
        id = `${tag}-${candidate++}`;
      }
    }
    const flag = await flagsmith.getExperimentFlag(values.feature, id); // records the $flag_exposure event
    const arm = String(flag.value);
    seen[arm] = (seen[arm] ?? 0) + 1;
    if (rng() < (rates[arm] ?? Number(values.base))) {
      flagsmith.trackEvent(values.event, { identifier: id });
      converted[arm] = (converted[arm] ?? 0) + 1;
    }
    if (i % 100 === 99) await flagsmith.flushEvents();
  }
  await flagsmith.flushEvents();

  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  console.log(`simulated ${total} users${skew ? ` (skew ${skew}: ${skew}% of exposures to control, ${probes} probes)` : ''}, seed ${seed}`);
  for (const a of arms) {
    console.log(`  ${a.padEnd(10)} exposed ${String(seen[a]).padStart(5)} (${((100 * seen[a]) / total).toFixed(1)}%)  converted ${String(converted[a]).padStart(4)}`);
  }

  // Ask Flagsmith to recompute results so the Grafana panels show them (5 minute limit, HTTP 429 is fine).
  const masterKey = process.env.FLAGSMITH_MASTER_KEY ?? state.masterKey;
  if (!values['no-refresh'] && masterKey && values.experiment) {
    await new Promise((r) => setTimeout(r, 1500)); // let Flagsmith ingest the flushed events
    const res = await fetch(`${values.url}/api/v1/environments/${values.env}/experiments/${values.experiment}/results/refresh/`, {
      method: 'POST',
      headers: { Authorization: `Api-Key ${masterKey}`, Accept: 'application/json' },
    });
    console.log(res.status === 429 ? 'results refresh: throttled by Flagsmith (once per 5 minutes), try again later' : `results refresh: HTTP ${res.status}`);
  } else if (!values['no-refresh']) {
    console.log('results refresh skipped (no master key or experiment id; open the dashboard as a Grafana Admin to refresh)');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`simulate: ${e.message}`);
    process.exit(1);
  });
}
