import { Flagsmith } from "@flagsmith/nodejs";
import { toDateNumber, type ISODate } from "@raktflow/core";
import {
  DEFAULT_FORECAST_CONFIG,
  DEFAULT_HEALTH_QUESTIONS,
  FAIL_CLOSED_BANK_FLAGS,
  FLAG,
  forecastConfigSchema,
  healthQuestionsSchema,
  type BankFlags,
  type CallScript,
  type DonorFlags,
} from "./definitions";

/**
 * Flagsmith in local-evaluation mode: the SDK keeps the environment document
 * in memory and evaluates segments here, so a flag check costs no network
 * call however many requests we serve. The document refreshes on an interval
 * and immediately when Flagsmith's audit webhook tells us something changed.
 */
type Flags = Awaited<ReturnType<Flagsmith["getIdentityFlags"]>>;

const globalForFlags = globalThis as unknown as { __raktflowFlagsmith?: Flagsmith | null };

function getClient(): Flagsmith | null {
  if (globalForFlags.__raktflowFlagsmith !== undefined) return globalForFlags.__raktflowFlagsmith;
  const environmentKey = process.env.FLAGSMITH_SERVER_KEY;
  if (!environmentKey) {
    globalForFlags.__raktflowFlagsmith = null;
    return null;
  }
  globalForFlags.__raktflowFlagsmith = new Flagsmith({
    environmentKey,
    enableLocalEvaluation: environmentKey.startsWith("ser."),
    environmentRefreshIntervalSeconds: Number(process.env.FLAGSMITH_REFRESH_SECONDS ?? 30),
    requestTimeoutSeconds: 5,
    ...(process.env.FLAGSMITH_API_URL ? { apiUrl: process.env.FLAGSMITH_API_URL } : {}),
    defaultFlagHandler: () => ({ enabled: false, isDefault: true, value: null }) as never,
  });
  return globalForFlags.__raktflowFlagsmith;
}

/** Pull the latest environment now (called from the Flagsmith webhook). */
export async function refreshFlags(): Promise<void> {
  const client = getClient() as unknown as { updateEnvironment?: () => Promise<void> } | null;
  await client?.updateEnvironment?.();
}

function parseJson<T>(raw: unknown, parse: (v: unknown) => T, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    return parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return fallback;
  }
}

export interface BankIdentity {
  slug: string;
  state: string;
  /** The bank's current date (demo clock or today). Lets segments switch festive mode by date. */
  date: ISODate;
}

export function bankIdentifier(slug: string): string {
  return `bank_${slug}`;
}

export async function getBankFlags(bank: BankIdentity): Promise<BankFlags> {
  const client = getClient();
  if (!client) return FAIL_CLOSED_BANK_FLAGS;
  let flags: Flags;
  try {
    flags = await client.getIdentityFlags(bankIdentifier(bank.slug), {
      state: bank.state,
      today: toDateNumber(bank.date),
    });
  } catch {
    return FAIL_CLOSED_BANK_FLAGS;
  }
  const max = Number(flags.getFeatureValue(FLAG.maxConcurrentCalls));
  return {
    festiveMode: flags.isFeatureEnabled(FLAG.festiveMode),
    surgeMode: flags.isFeatureEnabled(FLAG.surgeMode),
    outboundCallsEnabled: flags.isFeatureEnabled(FLAG.outboundCallsEnabled),
    maxConcurrentCalls: flags.isFeatureEnabled(FLAG.maxConcurrentCalls) && Number.isFinite(max) ? Math.max(0, max) : 0,
    forecastConfig: parseJson(flags.getFeatureValue(FLAG.forecastConfig), (v) => forecastConfigSchema.parse(v), DEFAULT_FORECAST_CONFIG),
    healthQuestions: parseJson(flags.getFeatureValue(FLAG.healthQuestions), (v) => healthQuestionsSchema.parse(v), DEFAULT_HEALTH_QUESTIONS),
    source: "flagsmith",
  };
}

export interface DonorIdentity {
  ref: string;
  language: string;
  donorType: string;
  state: string;
}

export async function getDonorFlags(donor: DonorIdentity): Promise<DonorFlags> {
  const fallback: DonorFlags = { language: donor.language, callScript: "standard", source: "defaults" };
  const client = getClient();
  if (!client) return fallback;
  try {
    const flags = await client.getIdentityFlags(donor.ref, {
      language: donor.language,
      donor_type: donor.donorType,
      state: donor.state,
    });
    const script = String(flags.getFeatureValue(FLAG.callScript) ?? "standard");
    return {
      language: donor.language,
      callScript: (script === "festive" ? "festive" : "standard") satisfies CallScript,
      source: "flagsmith",
    };
  } catch {
    return fallback;
  }
}
