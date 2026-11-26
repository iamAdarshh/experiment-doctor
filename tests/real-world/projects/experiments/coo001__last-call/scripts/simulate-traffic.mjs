// SIMULATED traffic. Sends real exposure and conversion events to Flagsmith through the Node SDK,
// but the "users" are generated here. Everything this script touches is labelled simulated.
// Usage: node scripts/simulate-traffic.mjs --flag invite_cta --event invite_sent --users 1200 \
//          --rates control=0.10,short=0.16 --prefix sim-a
import { Flagsmith } from '@flagsmith/nodejs';
import { loadEnv, requireEnv } from '../src/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ')]; }));
const cfg = loadEnv(); requireEnv(cfg, ['envKey']);
const flagName = args.flag; const event = args.event;
const users = Number(args.users || 300);
const rates = Object.fromEntries((args.rates || 'control=0.1').split(',').map((p) => { const [k, v] = p.split('='); return [k, Number(v)]; }));
const prefix = args.prefix || 'sim';
const start = Number(args.start || 0);

// deterministic pseudo-random per user, so a re-run reproduces the same conversions
function rand(seed) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; }

const client = new Flagsmith({ environmentKey: cfg.envKey, enableEvents: true });
const seen = {}; const conv = {}; let notEnrolled = 0; let failed = 0;
const ids = Array.from({ length: users }, (_, i) => `${prefix}-${String(start + i).padStart(5, '0')}`);
async function one(id) {
  try {
    const flag = await client.getExperimentFlag(flagName, id);
    const variant = flag.variant || String(flag.value);
    if (!flag.experiment?.inExperiment) notEnrolled++;
    seen[variant] = (seen[variant] || 0) + 1;
    const rate = rates[variant] ?? rates.control ?? 0;
    if (rand(`${id}:${event}`) < rate) { client.trackEvent(event, { identifier: id }); conv[variant] = (conv[variant] || 0) + 1; }
  } catch (e) { failed++; if (failed <= 3) console.error('error', e.message); }
}
const queue = [...ids];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await one(queue.shift()); }));
await client.flushEvents();
await client.close();
console.log(JSON.stringify({ simulated: true, flag: flagName, event, users, sent: seen, conversions: conv, notEnrolled, failed }));
