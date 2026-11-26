/**
 * FlagPilot traffic simulator.
 *
 * ⚠️ This generates SIMULATED users (allowed by the hackathon rules). Each simulated
 * user is a brand-new Flagsmith identity that:
 *   1. evaluates the experiment flag via getExperimentFlag()  -> Flagsmith records an exposure
 *   2. "clicks" the CTA with some probability                -> trackEvent(<metric event>)
 * The click probability is `base` for control, and `base * (1 + lift)` for the `winner` variant,
 * so we know the true answer and can check that Flagsmith's stats find it.
 *
 * Usage:
 *   pnpm simulate --users 600 --lift 0.15 [--flag pricing_cta_experiment] [--event cta_clicked]
 *                 [--base 0.10] [--winner live_demo] [--concurrency 8]
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Flagsmith } from '@flagsmith/nodejs'; // named export in v9

const { values: args } = parseArgs({
  options: {
    users: { type: 'string', default: '100' },
    lift: { type: 'string', default: '0.15' },
    base: { type: 'string', default: '0.10' },
    flag: { type: 'string', default: 'pricing_cta_experiment' },
    event: { type: 'string', default: 'cta_clicked' },
    winner: { type: 'string', default: 'live_demo' },
    concurrency: { type: 'string', default: '8' },
  },
});

const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY;
if (!environmentKey?.startsWith('ser.')) {
  console.error('Set FLAGSMITH_ENVIRONMENT_KEY to a server-side key (ser.…) — see .env.example');
  process.exit(1);
}

const users = Number(args.users);
const base = Number(args.base);
const lift = Number(args.lift);
const concurrency = Number(args.concurrency);

// enableEvents is REQUIRED: without it getExperimentFlag/trackEvent throw.
const fs = new Flagsmith({ environmentKey, enableEvents: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tally: Record<string, { exposed: number; converted: number }> = {};

/** Simulate one visitor: exposure, then maybe a conversion a little later. */
async function visit(): Promise<void> {
  const id = `sim-${randomUUID()}`;
  const flag = await fs.getExperimentFlag(args.flag!, id); // records the exposure
  // The flag VALUE is the variant value (e.g. "control" or "live_demo").
  const variant = String(flag.value ?? 'control');
  const t = (tally[variant] ??= { exposed: 0, converted: 0 });
  t.exposed++;

  const p = variant === args.winner ? base * (1 + lift) : base;
  await sleep(50 + Math.random() * 250); // jitter: users take a moment to click
  if (Math.random() < p) {
    // Same identifier as the exposure, otherwise Flagsmith can't join them.
    fs.trackEvent(args.event!, { identifier: id });
    t.converted++;
  }
}

async function main() {
  console.log(`Simulating ${users} users on "${args.flag}" (event "${args.event}", base ${base}, lift ${lift} for "${args.winner}")`);
  let next = 0;
  // Small worker pool so we don't hammer the API.
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < users) {
      next++;
      try {
        await visit();
      } catch (e) {
        console.error('visit failed:', (e as Error).message);
      }
    }
  });
  await Promise.all(workers);
  await fs.close(); // flushes buffered events — skipping this silently loses them
  console.table(
    Object.fromEntries(
      Object.entries(tally).map(([v, t]) => [v, { ...t, rate: (t.converted / t.exposed).toFixed(3) }]),
    ),
  );
  console.log('Events flushed. Note: Flagsmith results can take a few minutes to reflect them.');
}

main();
