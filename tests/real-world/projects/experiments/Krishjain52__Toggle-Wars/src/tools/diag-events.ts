/**
 * Diagnose event delivery: runs the swarm's exact SDK pattern (concurrent
 * exposures, delayed conversions, flush) against a throwaway experiment with a
 * console logger, then cleans up. Usage: tsx src/tools/diag-events.ts [n] [delaySec]
 */
import { Flagsmith } from "@flagsmith/nodejs";
import { config } from "../config.js";
import * as fs from "../flagsmith/admin.js";
import { pool } from "../llm.js";
import { expose, waitUntilLive } from "../flagsmith/sdk.js";

const n = Number(process.argv[2] ?? 200);
const delay = Number(process.argv[3] ?? 30);
const log = (lvl: string) => (...a: unknown[]) => console.log(`[sdk ${lvl}]`, ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x)?.slice(0, 300))));
const logger = { trace() {}, debug() {}, info: log("info"), warn: log("warn"), error: log("error"), fatal: log("fatal"), child() { return logger; } };

const name = `diag_${Date.now().toString(36)}`;
const metric = await fs.ensureMetric("Arena sign-ups", "arena_signup");
const big = (tag: string) => JSON.stringify({ tag, pad: "x".repeat(900) }); // page-sized values
const feature = await fs.createArenaFlag(name, "event delivery diagnostic", big("control"), [
  { key: "b", value: big("b") }, { key: "c", value: big("c") }, { key: "d", value: big("d") },
]);
const exp = await fs.createExperiment({ feature, name, hypothesis: "diag", metricId: metric.id });
await fs.startExperiment(exp.id);
console.log("experiment", exp.id, "flag", name);

const sdk = new Flagsmith({ environmentKey: config.flagsmith.environmentKey(), enableEvents: true, logger: logger as never });
const tw = Date.now();
await waitUntilLive(sdk, name, exp.id);
console.log(`experiment live at the edge after ${Date.now() - tw}ms`);
const ids = Array.from({ length: n }, (_, i) => `${name}-${i}`);
const t0 = Date.now();
const exps = await pool(ids, 10, (id) => expose(sdk, name, id));
console.log(`not enrolled: ${exps.filter((e) => !e.inExperiment).length}/${n}`);
const keys = exps.map((e) => e.variantKey);
console.log(`exposed ${n} in ${Date.now() - t0}ms`, Object.fromEntries([...new Set(keys)].map((k) => [k, keys.filter((x) => x === k).length])));
console.log(`waiting ${delay}s (simulating LLM time)…`);
await new Promise((r) => setTimeout(r, delay * 1000));
let conv = 0;
for (const id of ids) if (Math.random() < 0.2) { sdk.trackEvent("arena_signup", { identifier: id }); conv++; }
await sdk.flushEvents();
console.log(`tracked ${conv} conversions and flushed; expected events ≈ ${n + conv}`);
await sdk.close();
console.log(JSON.stringify({ experiment: exp.id, flag: name, expected: n + conv }));
