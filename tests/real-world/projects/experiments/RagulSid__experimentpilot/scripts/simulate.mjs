// Scripted traffic for the CreatorDigest experiment. DEVELOPMENT ONLY. Synthetic data.
// Each simulated visitor gets its own sim_ id, gets the experiment flag (recording an exposure)
// and sends the page's conversion event at a made-up rate. Uses the same Flagsmith SDK, flag key
// and event constant as the page.
//
//   node scripts/simulate.mjs --users 400 --bound ../flagsmith.json
import { readFileSync } from 'node:fs';
import { createFlagsmithInstance } from '@flagsmith/flagsmith/isomorphic';
import { CTA_EVENT } from '../site/app.js';
import { simIds, checkSimTarget, converts, MADE_UP_RATES } from '../src/simulate.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const USERS = Number(opt('--users', '400'));
const BOUND = opt('--bound');
const CONCURRENCY = 5;

let localConfig;
try {
  localConfig = await import('../site/config.local.js');
} catch {
  console.error('site/config.local.js is missing: scripted traffic needs the local Development key.');
  process.exit(1);
}
try {
  const bound = BOUND ? JSON.parse(readFileSync(BOUND, 'utf8')).environment : undefined;
  checkSimTarget(localConfig, bound);
} catch (err) {
  console.error(`Refusing: ${err.message}`);
  process.exit(1);
}

// The Development rehearsal flag lives in config.local.js; the committed config.js names the real
// (Production) flag, which scripted traffic must never touch.
const FLAG_KEY = localConfig.FLAG_KEY;
if (!FLAG_KEY) {
  console.error('Refusing: site/config.local.js has no FLAG_KEY (the Development rehearsal flag).');
  process.exit(1);
}

const runTag = Date.now().toString(36);
const ids = simIds(USERS, runTag);

async function visit(identifier) {
  const client = createFlagsmithInstance();
  await client.init({ environmentID: localConfig.FLAGSMITH_ENVIRONMENT_KEY, enableEvents: true });
  await client.identify(identifier);
  const flag = client.getExperimentFlag(FLAG_KEY); // records the exposure
  const value = typeof flag?.value === 'string' ? flag.value : 'control';
  const enrolled = Boolean(flag?.experiment?.inExperiment);
  const converted = enrolled && converts(value);
  if (converted) client.trackEvent(CTA_EVENT, { identifier }); // same id as identify()
  await client.flushEvents();
  await client.close(5000);
  return { value, enrolled, converted };
}

const results = [];
const errors = [];
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    try {
      results.push(await visit(id));
    } catch (err) {
      errors.push(`${id}: ${err?.message ?? err}`);
    }
  }
}

console.log(`Scripted traffic: ${USERS} visitors ${ids[0]} .. ${ids.at(-1)} on ${localConfig.FLAGSMITH_ENVIRONMENT_NAME}, flag ${FLAG_KEY}, event ${CTA_EVENT}`);
console.log(`Made-up conversion rates (synthetic): ${JSON.stringify(MADE_UP_RATES)}`);
const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const summary = {};
for (const r of results) {
  const s = (summary[r.value] ??= { visitors: 0, enrolled: 0, [CTA_EVENT]: 0 });
  s.visitors += 1;
  if (r.enrolled) s.enrolled += 1;
  if (r.converted) s[CTA_EVENT] += 1;
}
console.table(summary);
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s: ${results.length} ok, ${errors.length} failed. Run tag ${runTag}.`);
if (errors.length) {
  console.error(`First errors:\n${errors.slice(0, 5).join('\n')}`);
  process.exit(1);
}
