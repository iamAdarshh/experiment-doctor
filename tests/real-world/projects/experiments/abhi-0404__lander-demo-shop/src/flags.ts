import { useExperiment } from "@flagsmith/flagsmith/react";
import type { IInitConfig } from "@flagsmith/flagsmith/types";

/** Options for the Flagsmith provider. Events are on so exposures reach the experiment. */
export function flagsmithOptions(): IInitConfig {
  const identifier = new URLSearchParams(globalThis.location?.search ?? "").get("user") ?? "demo-shop-visitor";
  return {
    environmentID: import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_ID ?? "",
    identity: identifier,
    enableEvents: true,
  };
}

/**
 * The variant this visitor sees for a multivariate flag: the flag value, which equals the
 * variant key in this demo. Returns null until flags load or when the flag is missing, so
 * callers fall through to the control branch. Reading through useExperiment records an
 * exposure when the visitor is enrolled in a running experiment.
 */
export function useVariant(flagKey: string): string | null {
  const flag = useExperiment(flagKey);
  if (!flag || flag.value === null || flag.value === undefined) return null;
  return String(flag.value);
}
