import { Flagsmith } from "@flagsmith/nodejs";
import { config } from "../config.js";

/**
 * The SDK side: what a real app does. Each synthetic visitor is a Flagsmith
 * identity; `getExperimentFlag` buckets them and records the exposure, and
 * `trackEvent` records the conversion. Flagsmith joins the two per identity.
 */
export function createSdk(): Flagsmith {
  const { apiUrl, eventsUrl } = config.flagsmith;
  return new Flagsmith({
    environmentKey: config.flagsmith.environmentKey(),
    enableEvents: true,
    ...(apiUrl ? { apiUrl } : {}),
    ...(eventsUrl ? { eventProcessorConfig: { eventsApiUrl: eventsUrl } } : {}),
  });
}

export interface Exposure {
  /** Variant key the visitor was bucketed into ("control" for the champion). */
  variantKey: string;
  /** Raw flag value: the page JSON this visitor sees. */
  value: string;
  inExperiment: boolean;
}

type ExperimentAware = { value: unknown; variant?: string; experiment?: { id?: number; inExperiment?: boolean } };

export async function expose(sdk: Flagsmith, flagName: string, visitorId: string): Promise<Exposure> {
  const f = (await sdk.getExperimentFlag(flagName, visitorId)) as ExperimentAware;
  return {
    variantKey: f.variant ?? "control",
    value: String(f.value ?? ""),
    // No experiment metadata means Flagsmith did not enrol this identity and recorded no exposure.
    inExperiment: f.experiment?.inExperiment === true,
  };
}

/**
 * A freshly started experiment takes a few seconds to reach Flagsmith's edge.
 * Identities evaluated before then get the flag without the experiment, so no
 * exposure is recorded. Probe with side-effect-free evaluations until several
 * consecutive fresh identities see the experiment.
 */
export async function waitUntilLive(sdk: Flagsmith, flagName: string, experimentId: number, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let streak = 0;
  for (let i = 0; Date.now() < deadline; i++) {
    const flags = await sdk.getIdentityFlags(`edge-probe-${flagName}-${i}`);
    const f = flags.getFlag(flagName) as unknown as ExperimentAware;
    streak = f.experiment?.id === experimentId ? streak + 1 : 0;
    if (streak >= 3) return;
    await new Promise((r) => setTimeout(r, streak ? 1000 : 3000));
  }
  throw new Error(`Experiment ${experimentId} did not reach the Flagsmith edge within ${timeoutMs / 1000}s`);
}

export const SIGNUP_EVENT = "arena_signup";

export function convert(sdk: Flagsmith, visitorId: string) {
  sdk.trackEvent(SIGNUP_EVENT, { identifier: visitorId });
}
