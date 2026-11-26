import { createFlagsmithInstance } from "@flagsmith/flagsmith";
import type { IFlagsmith } from "@flagsmith/flagsmith/types";

export const DEFAULT_FLAGSMITH_EDGE_API = "https://edge.api.flagsmith.com/api/v1";

export interface ClientFlagState {
  connected: boolean;
  enabled: boolean;
  value: unknown;
  variationKey: string;
  checkoutVersion: "v1" | "v2";
  source: "flagsmith_js_sdk" | "fallback_default";
  error?: string | null;
}

function normalizeFlagsmithApiUrl(rawUrl?: string): string {
  const base = (rawUrl || DEFAULT_FLAGSMITH_EDGE_API).trim().replace(/\/+$/, "");
  return `${base}/`;
}

export function normalizeCheckoutVariation(
  enabled: boolean,
  value: unknown,
): { checkoutVersion: "v1" | "v2"; variationKey: string } {
  if (typeof value === "string") {
    const cleaned = value.trim().toLowerCase();
    if (["v2", "treatment", "checkout_v2", "express", "true", "1"].includes(cleaned)) {
      return {
        checkoutVersion: "v2",
        variationKey: cleaned === "v2" || cleaned === "treatment" ? cleaned : "treatment",
      };
    }
    if (["v1", "control", "checkout_v1", "classic", "false", "0"].includes(cleaned)) {
      return {
        checkoutVersion: "v1",
        variationKey: cleaned === "v1" || cleaned === "control" ? cleaned : "control",
      };
    }
  }
  return enabled
    ? { checkoutVersion: "v2", variationKey: "treatment" }
    : { checkoutVersion: "v1", variationKey: "control" };
}

class DemoFlagsmithClient {
  private instance: IFlagsmith | null = null;
  private initializedEnvKey = "";
  private initializedApi = "";

  async evaluateUser(params: {
    envKey: string;
    edgeApiUrl: string;
    userId: string;
  }): Promise<ClientFlagState> {
    const trimmedKey = params.envKey.trim();
    if (!trimmedKey) {
      return {
        connected: false,
        enabled: false,
        value: "v1",
        variationKey: "v1",
        checkoutVersion: "v1",
        source: "fallback_default",
        error: "NEXT_PUBLIC_FLAGSMITH_ENV_KEY is not configured.",
      };
    }

    const api = normalizeFlagsmithApiUrl(params.edgeApiUrl);

    try {
      if (
        !this.instance ||
        this.initializedEnvKey !== trimmedKey ||
        this.initializedApi !== api
      ) {
        this.instance = createFlagsmithInstance();
        this.initializedEnvKey = trimmedKey;
        this.initializedApi = api;
        await this.instance.init({
          environmentID: trimmedKey,
          api,
          identity: params.userId,
          cacheFlags: false,
          defaultFlags: {
            checkout_v2: { enabled: false, value: "v1" },
          },
        });
      } else {
        await this.instance.identify(params.userId);
      }

      const enabled = this.instance.hasFeature("checkout_v2");
      const value = this.instance.getValue("checkout_v2");
      const { checkoutVersion, variationKey } = normalizeCheckoutVariation(enabled, value);
      return {
        connected: true,
        enabled,
        value: value ?? (checkoutVersion === "v2" ? "v2" : "v1"),
        variationKey,
        checkoutVersion,
        source: "flagsmith_js_sdk",
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Flagsmith JS evaluation error";
      return {
        connected: false,
        enabled: false,
        value: "v1",
        variationKey: "v1",
        checkoutVersion: "v1",
        source: "fallback_default",
        error: msg,
      };
    }
  }
}

export const demoFlagsmithClient = new DemoFlagsmithClient();
