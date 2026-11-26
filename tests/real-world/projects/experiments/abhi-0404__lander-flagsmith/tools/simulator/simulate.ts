/**
 * Traffic simulator for the demo experiments (plan B7). Uses @flagsmith/nodejs >= 9.1.0.
 *
 *   pnpm simulate --env staging              # needs FLAGSMITH_SERVER_KEY_STAGING
 *   pnpm simulate --env staging --dry-run    # prints the deterministic plan, no keys, no network
 *
 * Deterministic: the same --seed gives the same identities, draws and timestamps.
 * Timestamps fall in the last 2 days (Flagsmith rejects events older than 10 days).
 *
 * How the three scenarios are produced:
 *   checkout_cta    1500 identities, control 10 percent, variant 14 percent  -> clear SHIP
 *   pricing_banner   400 identities, 10 vs 11.5 percent                      -> KEEP RUNNING (~84 percent)
 *   signup_steps    1000 identities, only 60 percent of variant identities are
 *                   exposed: a 50/50 test that shows about 62/38                -> SRM, DO NOT TRUST
 * To know which arm an identity is in before exposing it, a second client with local
 * evaluation predicts the arm (it does not record events). Then the events client
 * evaluates remotely with getExperimentFlag (which records the exposure) for the
 * identities that should be exposed.
 *
 * UNVERIFIED (Phase 0 spike, A2 #21): whether getExperimentFlag is what records exposures
 * for this environment. If exposures need an explicit event, swap the call for
 * client.trackExposureEvent(feature, { identifier }).
 * The SDK stamps events with Date.now() when it buffers them, so this script
 * temporarily overrides Date.now() to place events inside the 2 day window.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { Flagsmith } from "@flagsmith/nodejs";
import { EXPERIMENT_FLAGS, METRIC, parseEnvName, type DemoExperimentFlag } from "../demoFlags.js";
import { DEFAULT_SEED, decide, planTraffic, type PlannedIdentity } from "./plan.js";

const { values } = parseArgs({
  options: {
    env: { type: "string" },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    scale: { type: "string", default: "1" },
    "dry-run": { type: "boolean", default: false },
    "api-url": { type: "string" },
    "events-url": { type: "string" },
    batch: { type: "string", default: "10" },
  },
});

const dryRun = values["dry-run"] === true;
const envName = parseEnvName(values.env);
const seed = Number(values.seed);
const scale = Number(values.scale);
const batchSize = Math.max(1, Number(values.batch));
if (!Number.isFinite(seed) || !Number.isFinite(scale) || scale <= 0) {
  console.error("--seed and --scale must be numbers (scale > 0).");
  process.exit(1);
}

for (const file of [".env", "../../.env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const flagByName = new Map<string, DemoExperimentFlag>(EXPERIMENT_FLAGS.map((f) => [f.name, f]));
const plan = planTraffic(seed, { scale });

function summarise(): void {
  console.log(`Plan: ${plan.length} identities, seed ${seed}, scale ${scale}`);
  for (const f of EXPERIMENT_FLAGS) {
    const mine = plan.filter((p) => p.flag === f.name);
    const oldest = Math.max(...mine.map((p) => p.exposureAgoMs));
    console.log(
      `  ${f.name.padEnd(16)} ${String(mine.length).padStart(5)} identities  ` +
        `control ${+(f.controlRate * 100).toFixed(1)}%  variant ${+(f.variantRate * 100).toFixed(1)}%  ` +
        `variant exposure ${f.variantExposureRate * 100}%  oldest ${(oldest / 3_600_000).toFixed(1)}h ago`,
    );
  }
}

if (dryRun) {
  summarise();
  console.log("Dry run: nothing sent.");
  process.exit(0);
}

const serverKey =
  envName === "staging" ? process.env["FLAGSMITH_SERVER_KEY_STAGING"] : process.env["FLAGSMITH_SERVER_KEY_PRODUCTION"];
if (!serverKey) {
  console.error(
    `Set FLAGSMITH_SERVER_KEY_${envName.toUpperCase()} in .env (a server-side SDK key for the ${envName} environment).`,
  );
  process.exit(1);
}

const apiUrl = values["api-url"] ?? (process.env["FLAGSMITH_SDK_API_URL"] || undefined);
const eventsUrl = values["events-url"] ?? (process.env["FLAGSMITH_EVENTS_URL"] || undefined);

/** Variant key an evaluated flag landed in. Variant values equal variant keys in this demo. */
function armOf(flag: { variant?: string | undefined; value: unknown }, f: DemoExperimentFlag): boolean {
  return (flag.variant ?? String(flag.value)) === f.variantKey;
}

async function main(): Promise<void> {
  summarise();
  const events = new Flagsmith({
    environmentKey: serverKey!,
    enableEvents: true,
    ...(apiUrl ? { apiUrl } : {}),
    ...(eventsUrl ? { eventProcessorConfig: { eventsApiUrl: eventsUrl } } : {}),
  });
  // Local evaluation client: predicts the arm without recording anything.
  const predictor = new Flagsmith({
    environmentKey: serverKey!,
    enableLocalEvaluation: true,
    ...(apiUrl ? { apiUrl } : {}),
  });

  // The SDK stamps events with Date.now() when it buffers them. Place them inside the 2 day
  // window by overriding the clock for the whole run: one shared clock value per batch.
  const realNow = Date.now.bind(Date);
  const startedAt = realNow();
  let clockTs = Number.POSITIVE_INFINITY;
  Date.now = () => Math.min(clockTs, realNow());
  const at = <T>(ts: number, fn: () => T): T => {
    const prev = clockTs;
    clockTs = ts;
    try {
      return fn();
    } finally {
      clockTs = prev;
    }
  };

  let exposed = 0;
  let dropped = 0;
  let conversions = 0;
  const arms = new Map<string, { control: number; variant: number }>();

  for (let i = 0; i < plan.length; i += batchSize) {
    const batch = plan.slice(i, i + batchSize);
    const batchTs = startedAt - (batch[0]?.exposureAgoMs ?? 0);
    clockTs = batchTs;
    await Promise.all(
      batch.map(async (p: PlannedIdentity) => {
        const f = flagByName.get(p.flag)!;
        const predicted = armOf((await predictor.getIdentityFlags(p.identity)).getFlag(p.flag), f);
        const decision = decide(p, f, predicted);
        if (!decision.exposed) {
          dropped++;
          return;
        }
        const flag = await events.getExperimentFlag(p.flag, p.identity);
        const actual = armOf(flag, f);
        const tally = arms.get(p.flag) ?? { control: 0, variant: 0 };
        tally[actual ? "variant" : "control"]++;
        arms.set(p.flag, tally);
        exposed++;
        if (decision.converted) {
          at(batchTs + p.conversionDelayMs, () => events.trackEvent(METRIC.event, { identifier: p.identity }));
          conversions++;
        }
      }),
    );
    if ((i / batchSize) % 20 === 0) console.log(`  ${Math.min(i + batchSize, plan.length)}/${plan.length}`);
  }

  await events.flushEvents();
  await events.close();
  await predictor.close();
  Date.now = realNow;

  console.log(`Exposed ${exposed}, dropped ${dropped}, conversions ${conversions}`);
  for (const [name, t] of arms) {
    const total = t.control + t.variant;
    console.log(`  ${name.padEnd(16)} control ${t.control}  variant ${t.variant}  (${((t.variant / total) * 100).toFixed(1)}% variant)`);
  }
  console.log("Warehouse first-event latency applies: results may take a while to appear.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
