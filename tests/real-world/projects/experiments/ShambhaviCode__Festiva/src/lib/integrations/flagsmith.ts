import { createHash } from "node:crypto";
import { Flagsmith, LocalFileHandler, type Flags } from "@flagsmith/nodejs";
import { z } from "zod";
import {
  CONFIG_LIMITS,
  DEFAULT_CONFIG,
  DEFAULT_FLAGS,
  EXPERIMENT_FLAG,
  FLAG_KEYS,
  REMOTE_CONFIG_KEY,
  type EvaluatedFlags,
  type FlagKey,
  type FlagSource,
  type RemoteConfig,
} from "../flags/definitions";
import { serverEnv, type ServerEnv } from "../env.server";
import { recordProviderCall } from "../ops/metrics";
import { recordAttempt } from "./status";

/**
 * FlagsmithProvider: feature flags, remote configuration and the onboarding
 * experiment, evaluated on the server with the official Flagsmith Node.js SDK.
 *
 * Modes, chosen from the environment:
 * - Local evaluation (server-side key, `ser.…`): the SDK downloads the
 *   environment document and refreshes it every FLAGSMITH_REFRESH_SECONDS
 *   (default 15). Flag changes in the Flagsmith dashboard reach FESTIVA within
 *   that interval, with no redeploy. Evaluation itself makes no network call.
 * - Remote evaluation (client-side key): every evaluation calls the Flagsmith
 *   API; FESTIVA caches the result for 5 seconds per identity.
 * - Offline document (FLAGSMITH_OFFLINE_ENVIRONMENT_FILE): the SDK evaluates a
 *   saved environment document with no network. Shown as "Offline document",
 *   never as connected. Used for tests and air-gapped demos.
 *
 * Failure: if Flagsmith cannot be reached or answers with an error, FESTIVA
 * uses the defaults in flags/definitions.ts and says so in `reason`.
 *
 * Identities are anonymous: a random identifier from the visitor's browser,
 * hashed again here before it is sent. No names, emails or circle content are
 * sent to Flagsmith as identities or traits.
 */

type Mode = "local" | "remote" | "offline";

interface ProviderState {
  key: string;
  client: Flagsmith;
  mode: Mode;
  environmentFetchedAt: string | null;
  lastError: string | null;
}

const holder = globalThis as unknown as { __festivaFlagsmith?: ProviderState | null; __festivaFlagCache?: Map<string, { at: number; value: EvaluatedFlags }> };
const cache = (holder.__festivaFlagCache ??= new Map());
const REMOTE_CACHE_MS = 5000;

export function flagsmithMode(env: ServerEnv = serverEnv()): Mode | null {
  if (env.FLAGSMITH_OFFLINE_ENVIRONMENT_FILE) return "offline";
  if (!env.FLAGSMITH_ENVIRONMENT_KEY) return null;
  return env.FLAGSMITH_ENVIRONMENT_KEY.startsWith("ser.") ? "local" : "remote";
}

export function refreshSeconds(env: ServerEnv = serverEnv()): number {
  return env.FLAGSMITH_REFRESH_SECONDS ?? 15;
}

function provider(env: ServerEnv = serverEnv()): ProviderState | null {
  const mode = flagsmithMode(env);
  if (!mode) return null;
  const key = `${mode}:${env.FLAGSMITH_ENVIRONMENT_KEY ?? ""}:${env.FLAGSMITH_API_URL ?? ""}:${env.FLAGSMITH_OFFLINE_ENVIRONMENT_FILE ?? ""}:${refreshSeconds(env)}`;
  const existing = holder.__festivaFlagsmith;
  if (existing && existing.key === key) return existing;
  // Configuration changed: stop the previous client's polling before replacing it.
  if (existing) void existing.client.close().catch(() => undefined);

  const state: ProviderState = { key, client: null as unknown as Flagsmith, mode, environmentFetchedAt: null, lastError: null };
  if (mode === "offline") {
    state.client = new Flagsmith({ offlineMode: true, offlineHandler: new LocalFileHandler(env.FLAGSMITH_OFFLINE_ENVIRONMENT_FILE!) });
  } else {
    state.client = new Flagsmith({
      environmentKey: env.FLAGSMITH_ENVIRONMENT_KEY!,
      apiUrl: env.FLAGSMITH_API_URL,
      enableLocalEvaluation: mode === "local",
      environmentRefreshIntervalSeconds: refreshSeconds(env),
      requestTimeoutSeconds: 4,
      retries: 1,
      enableAnalytics: true,
      enableEvents: env.FLAGSMITH_ENABLE_EVENTS === true,
      onEnvironmentChange: (error) => {
        // Called after every environment-document poll in local evaluation.
        const ok = !error;
        state.lastError = ok ? null : "environment_fetch_failed";
        if (ok) state.environmentFetchedAt = new Date().toISOString();
        recordProviderCall({ provider: "flagsmith", capability: "environment_document", ok, code: ok ? "ok" : "fetch_failed", ms: 0, controlledTest: false });
        void recordAttempt("flagsmith", "environment_document", { ok, detail: ok ? "Environment document refreshed" : "Environment document refresh failed", httpStatus: null, ms: null, model: null });
      },
    });
  }
  holder.__festivaFlagsmith = state;
  return state;
}

/** One-way hash of the browser's random identifier, so Flagsmith never sees even that raw value. */
export function identityFor(anonymousId: string): string {
  return `anon_${createHash("sha256").update(`festiva:${anonymousId}`).digest("hex").slice(0, 24)}`;
}

const configValueSchema = z.record(z.string(), z.unknown());

/** Validate remote configuration field by field; anything invalid falls back to its default and is reported. */
export function validateRemoteConfig(raw: unknown): { config: RemoteConfig; issues: string[] } {
  const issues: string[] = [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { config: { ...DEFAULT_CONFIG }, issues: [`${REMOTE_CONFIG_KEY} is not valid JSON; defaults used`] };
    }
  }
  if (value === null || value === undefined || value === "") return { config: { ...DEFAULT_CONFIG }, issues: [] };
  const parsed = configValueSchema.safeParse(value);
  if (!parsed.success) return { config: { ...DEFAULT_CONFIG }, issues: [`${REMOTE_CONFIG_KEY} must be a JSON object; defaults used`] };
  const config = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(parsed.data)) {
    if (!(key in DEFAULT_CONFIG)) issues.push(`Unknown setting "${key}" ignored`);
  }
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof RemoteConfig)[]) {
    if (!(key in parsed.data)) continue;
    const candidate = parsed.data[key];
    const [min, max] = CONFIG_LIMITS[key];
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= min && candidate <= max) config[key] = candidate;
    else issues.push(`${key} must be a whole number from ${min} to ${max}; default ${DEFAULT_CONFIG[key]} used`);
  }
  return { config, issues };
}

/** Deterministic 50/50 split, used only when Flagsmith is not configured. Labelled as such everywhere. */
export function localVariant(identity: string): "guided" | "single_page" {
  const n = parseInt(createHash("sha256").update(`onboarding:${identity}`).digest("hex").slice(0, 8), 16);
  return n % 2 === 0 ? "guided" : "single_page";
}

export interface Evaluation extends EvaluatedFlags {
  configIssues: string[];
  identity: string;
}

function fromFlags(flags: Flags | null, identity: string, source: FlagSource, reason: string | null): Evaluation {
  const values = { ...DEFAULT_FLAGS };
  if (flags) {
    for (const key of FLAG_KEYS) {
      const flag = flags.getFlag(key);
      // A flag missing from the Flagsmith environment keeps FESTIVA's default.
      if (!flag.isDefault) values[key] = flag.enabled;
    }
  }
  const configFlag = flags?.getFlag(REMOTE_CONFIG_KEY);
  const { config, issues } = configFlag && !configFlag.isDefault && configFlag.enabled ? validateRemoteConfig(configFlag.value) : { config: { ...DEFAULT_CONFIG }, issues: [] as string[] };

  let onboarding: EvaluatedFlags["onboarding"];
  if (!values[EXPERIMENT_FLAG]) {
    onboarding = { variant: "guided", inExperiment: false, assignedBy: "none" };
  } else if (flags && source !== "defaults") {
    const flag = flags.getFlag(EXPERIMENT_FLAG);
    const value = typeof flag.value === "string" ? flag.value : null;
    if (value === "guided" || value === "single_page") onboarding = { variant: value, inExperiment: true, assignedBy: "flagsmith" };
    else {
      onboarding = { variant: "guided", inExperiment: false, assignedBy: "none" };
      issues.push(`${EXPERIMENT_FLAG} is on but its value is not "guided" or "single_page"; guided onboarding used and no exposure recorded`);
    }
  } else {
    onboarding = { variant: localVariant(identity), inExperiment: true, assignedBy: "local-hash" };
  }

  return { flags: values, config, onboarding, source, reason, evaluatedAt: new Date().toISOString(), configIssues: issues, identity };
}

/**
 * Evaluate every FESTIVA flag for one anonymous visitor.
 * Never throws: on any failure the defaults are returned with a reason.
 */
export async function evaluateFlags(anonymousId: string | null, env: ServerEnv = serverEnv()): Promise<Evaluation> {
  const identity = identityFor(anonymousId ?? "server");
  const state = provider(env);
  if (!state) return fromFlags(null, identity, "defaults", "Flagsmith is not configured");

  const cacheKey = `${state.key}|${identity}`;
  if (state.mode === "remote") {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < REMOTE_CACHE_MS) return { ...(hit.value as Evaluation) };
  }

  const started = performance.now();
  try {
    const flags = await state.client.getIdentityFlags(identity, { surface: "web" });
    const ms = Math.round(performance.now() - started);
    const source: FlagSource = state.mode === "offline" ? "offline-document" : "flagsmith";
    const result = fromFlags(flags, identity, source, null);
    if (state.mode === "remote") {
      cache.set(cacheKey, { at: Date.now(), value: result });
      if (cache.size > 2000) cache.clear();
    }
    if (state.mode !== "offline") {
      state.lastError = null;
      recordProviderCall({ provider: "flagsmith", capability: "evaluate", ok: true, code: "ok", ms, controlledTest: false });
      await recordAttempt("flagsmith", state.mode === "local" ? "local_evaluation" : "remote_evaluation", { ok: true, detail: `${flags.allFlags().length} flags evaluated`, httpStatus: null, ms, model: null });
    }
    return result;
  } catch {
    const ms = Math.round(performance.now() - started);
    state.lastError = "evaluation_failed";
    recordProviderCall({ provider: "flagsmith", capability: "evaluate", ok: false, code: "evaluation_failed", ms, controlledTest: false });
    await recordAttempt("flagsmith", state.mode === "local" ? "local_evaluation" : "remote_evaluation", { ok: false, detail: "Flagsmith could not be reached or rejected the key", httpStatus: null, ms, model: null });
    return fromFlags(null, identity, "defaults", "Flagsmith could not be reached; safe defaults in use");
  }
}

/** Record an exposure or conversion with Flagsmith's events API, when enabled. Never throws. */
export function trackFlagsmithEvent(event: string, anonymousId: string, metadata: Record<string, unknown>, env: ServerEnv = serverEnv()): boolean {
  if (env.FLAGSMITH_ENABLE_EVENTS !== true) return false;
  const state = provider(env);
  if (!state || state.mode === "offline") return false;
  try {
    if (event === "$exposure") state.client.trackExposureEvent(EXPERIMENT_FLAG, { identifier: identityFor(anonymousId), value: String(metadata.variant ?? ""), metadata });
    else state.client.trackEvent(event, { identifier: identityFor(anonymousId), metadata });
    return true;
  } catch {
    return false;
  }
}

export function flagsmithState(env: ServerEnv = serverEnv()) {
  const mode = flagsmithMode(env);
  const state = mode ? provider(env) : null;
  return {
    mode,
    apiUrl: env.FLAGSMITH_API_URL ?? (mode && mode !== "offline" ? "https://edge.api.flagsmith.com/api/v1/" : null),
    refreshSeconds: mode === "local" ? refreshSeconds(env) : null,
    eventsEnabled: env.FLAGSMITH_ENABLE_EVENTS === true,
    environmentFetchedAt: state?.environmentFetchedAt ?? null,
    lastError: state?.lastError ?? null,
    keyKind: env.FLAGSMITH_ENVIRONMENT_KEY ? (env.FLAGSMITH_ENVIRONMENT_KEY.startsWith("ser.") ? "server-side" : "client-side") : null,
  };
}

export async function resetFlagsmithForTests(): Promise<void> {
  await holder.__festivaFlagsmith?.client.close().catch(() => undefined);
  holder.__festivaFlagsmith = null;
  cache.clear();
}

export type { FlagKey };
