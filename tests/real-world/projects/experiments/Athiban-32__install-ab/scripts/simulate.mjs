// Traffic simulator. Each simulated visitor:
//   1. gets the experiment flag for its own identity (Flagsmith records the exposure), then
//   2. copies the install command with a probability that depends on the version it saw.
// The rates are an assumed behaviour model, not measured data; they are printed with every
// run so the demo is honest about what is simulated. Real browser visitors use the same
// flag and event, so their data lands in the same experiment.
//
// Usage: npm run simulate -- --visitors 400 --rates one_liner=0.30,steps=0.24,os_picker=0.38
import { parseArgs } from 'node:util';
import { FLAG_KEY, CONVERSION_EVENT, VARIANTS, normaliseVariant } from '../src/experiment.js';
import { createClient } from './flagsmith-client.mjs';

const { values } = parseArgs({
  options: {
    visitors: { type: 'string', default: '300' },
    rates: { type: 'string', default: 'one_liner=0.30,steps=0.24,os_picker=0.38' },
    concurrency: { type: 'string', default: '8' },
    seed: { type: 'string' },
  },
});

const visitors = Number(values.visitors);
const concurrency = Number(values.concurrency);
const rates = Object.fromEntries(
  values.rates.split(',').map((kv) => {
    const [k, v] = kv.split('=');
    return [k.trim(), Number(v)];
  }),
);
for (const v of VARIANTS) {
  if (!(rates[v] >= 0 && rates[v] <= 1)) throw new Error(`Missing or bad rate for "${v}"`);
}

// Small seeded PRNG (mulberry32) so a run can be repeated exactly with --seed.
let s = values.seed ? Number(values.seed) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
const seed = s;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

const runId = Date.now().toString(36);
const flagsmith = createClient();
const tally = Object.fromEntries(VARIANTS.map((v) => [v, { seen: 0, enrolled: 0, copied: 0 }]));
let failures = 0;

async function visit(i) {
  const identifier = `sim-${runId}-${i}`;
  try {
    const flag = await flagsmith.getExperimentFlag(FLAG_KEY, identifier);
    const variant = normaliseVariant(flag.value);
    const t = tally[variant];
    t.seen++;
    if (flag.experiment?.inExperiment) t.enrolled++;
    if (rand() < rates[variant]) {
      t.copied++;
      flagsmith.trackEvent(CONVERSION_EVENT, {
        identifier,
        metadata: { variant, simulated: true, run: runId },
      });
    }
  } catch (err) {
    failures++;
    if (failures <= 3) console.error(`visitor ${i} failed:`, err.message ?? err);
  }
}

console.log(`Simulating ${visitors} visitors (run ${runId}, seed ${seed})`);
console.log('Assumed copy rates:', rates);

let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < visitors) {
      const i = next++;
      await visit(i);
      if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${visitors}\n`);
    }
  }),
);

console.log('\nvariant      seen  enrolled  copied  copy-rate');
for (const [v, t] of Object.entries(tally)) {
  const rate = t.seen ? ((100 * t.copied) / t.seen).toFixed(1) + '%' : '-';
  console.log(
    `${v.padEnd(11)} ${String(t.seen).padStart(5)} ${String(t.enrolled).padStart(9)}` +
      ` ${String(t.copied).padStart(7)} ${rate.padStart(10)}`,
  );
}
if (failures) console.log(`\n${failures} visitors failed (see errors above).`);
const enrolled = Object.values(tally).reduce((a, t) => a + t.enrolled, 0);
if (!enrolled) {
  console.log('\nNo visitor was enrolled: is the experiment started, and is rollout above 0%?');
}

console.log('\nFlushing events to Flagsmith…');
await flagsmith.close(30000);
console.log('Done. Refresh results on the experiment page (allow a few minutes).');
