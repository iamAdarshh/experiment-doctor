import { Flagsmith } from "@flagsmith/nodejs";
import { previewMode, previewVariant } from "./preview.ts";

/**
 * Server-side Flagsmith client with Experimentation events enabled.
 * One instance per server process. Needs only the environment key, never an admin API key.
 */
let client: Flagsmith | undefined;

export function getFlagsmith(): Flagsmith {
  if (client) return client;
  const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY;
  if (!environmentKey) {
    throw new Error("FLAGSMITH_ENVIRONMENT_KEY is not set. See .env.example and docs/flagsmith-setup.md.");
  }
  const apiUrl = process.env.FLAGSMITH_API_URL;
  const eventsApiUrl = process.env.FLAGSMITH_EVENTS_URL;
  client = new Flagsmith({
    environmentKey,
    ...(apiUrl ? { apiUrl } : {}),
    enableEvents: true,
    ...(eventsApiUrl ? { eventProcessorConfig: { eventsApiUrl } } : {}),
    defaultFlagHandler: (featureName) => ({
      enabled: featureName === "roasts_enabled",
      isDefault: true,
      value: featureName === "roast_prompt" ? "control" : undefined,
    }),
  });
  return client;
}

export const FLAG_PROMPT = "roast_prompt";
export const FLAG_KILL_SWITCH = "roasts_enabled";
export const EVENT_GRAIN = "thumbs_up";
export const EVENT_CHAFF = "thumbs_down";
export const EVENT_COPY = "copy";
/** Fires for every served roast: a sanity check on engagement, not a metric that can separate prompts. */
export const EVENT_REQUESTED = "roast_requested";
/** Fires when a visitor roasts a second time: an early signal that the first roast was worth coming back for. */
export const EVENT_AGAIN = "roast_again";

/** Is the app switched on? Falls open if Flagsmith is unreachable, so the demo never goes dark by accident. */
export async function roastsEnabled(identity: string): Promise<boolean> {
  if (previewMode()) return true;
  try {
    const flags = await getFlagsmith().getIdentityFlags(identity);
    return flags.isFeatureEnabled(FLAG_KILL_SWITCH);
  } catch {
    return true;
  }
}

/**
 * Pick the variant for this identity. getExperimentFlag records the exposure by itself,
 * so call it only when a roast is actually served.
 */
export async function pickVariant(identity: string): Promise<string> {
  if (previewMode()) return previewVariant(identity);
  const flag = await getFlagsmith().getExperimentFlag(FLAG_PROMPT, identity);
  const key = (flag as { variant?: string }).variant ?? (typeof flag.value === "string" ? flag.value : "control");
  return key || "control";
}

export function trackEvent(identity: string, event: string): void {
  if (previewMode()) return;
  getFlagsmith().trackEvent(event, { identifier: identity });
}

export function trackVote(identity: string, vote: "up" | "down"): void {
  if (previewMode()) return;
  getFlagsmith().trackEvent(vote === "up" ? EVENT_GRAIN : EVENT_CHAFF, { identifier: identity });
}

/** Serverless functions can freeze after responding, so send buffered events before returning. */
export async function flushEvents(): Promise<void> {
  if (previewMode()) return;
  try {
    await getFlagsmith().flushEvents();
  } catch (err) {
    console.warn("Flagsmith flush failed:", err instanceof Error ? err.message : err);
  }
}
