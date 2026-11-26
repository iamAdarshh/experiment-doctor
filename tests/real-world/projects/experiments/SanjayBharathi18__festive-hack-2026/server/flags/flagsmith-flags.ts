import { AsyncLocalStorage } from "node:async_hooks";
import {
  DefaultFlag,
  Flagsmith,
  type FlagsmithConfig,
  type Flags as SdkFlags,
} from "@flagsmith/nodejs";
import type { Clock } from "../clock.ts";
import type { Config } from "../config.ts";
import type { Log } from "../log.ts";
import {
  flagDefaults,
  orderIdentity,
  segmentFor,
  type FlagName,
  type FlagValues,
  type Flags,
  type OrderFlags,
  type OrderTraits,
} from "./decisions.ts";
import { createDefaultFlags } from "./default-flags.ts";
import {
  conversionEvent,
  enrolmentFor,
  experimentFlag,
  flagNames,
  isFlagName,
  readFlag,
  storedDefault,
} from "./flag-values.ts";

export type FlagsmithDeps = {
  log: Log;
  clock: Clock;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Report = (flag: FlagName, problem: string) => void;
type Write = (first: unknown, second?: unknown) => void;
type SdkLog = Record<
  "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent",
  Write
> & { child: () => SdkLog };

export const requestTimeoutMs = 2000;
export const environmentRefreshMs = 60_000;

export function createFlags(
  config: Pick<Config, "FLAGSMITH_ENVIRONMENT_KEY" | "FLAGSMITH_API_URL">,
  {
    log,
    clock,
    fetch: send = fetch,
    timeoutMs = requestTimeoutMs,
  }: FlagsmithDeps,
): Flags {
  const environmentKey = config.FLAGSMITH_ENVIRONMENT_KEY;
  if (environmentKey === undefined) {
    log({
      msg: "flag source",
      source: "defaults",
      reason: "FLAGSMITH_ENVIRONMENT_KEY is not set",
    });
    return createDefaultFlags();
  }
  log({ msg: "flag source", source: "flagsmith" });
  const logger = sdkLogger(log, environmentKey);
  const callerSignal = new AsyncLocalStorage<AbortSignal | undefined>();
  const client = new Flagsmith({
    environmentKey,
    apiUrl: config.FLAGSMITH_API_URL,
    enableEvents: true,
    requestTimeoutSeconds: timeoutMs / 1000,
    retries: 0,
    defaultFlagHandler: (name) => {
      const stored = isFlagName(name)
        ? storedDefault(name)
        : { enabled: false, value: null };
      return new DefaultFlag(stored.value, stored.enabled);
    },
    // The SDK calls only error, warn and debug, so this object can stand in for its pino logger.
    logger: logger as unknown as NonNullable<FlagsmithConfig["logger"]>,
    // The SDK takes no AbortSignal, so the signal of the current call comes from the async context.
    fetch: (input, init) =>
      send(input, {
        ...init,
        signal: AbortSignal.any(
          [
            init?.signal,
            AbortSignal.timeout(timeoutMs),
            callerSignal.getStore(),
          ].filter((signal) => signal != null),
        ),
      }),
  });
  const report: Report = (flag, problem) =>
    log({
      msg: "flag value is not valid, so its default applies",
      flag,
      problem,
    });
  const settle = async (work: () => Promise<SdkFlags>) => {
    try {
      return await work();
    } catch (error) {
      logger.error(error, "flag evaluation failed");
      return undefined;
    }
  };
  let cached: { values: FlagValues; at: number } | undefined;
  let refreshing: Promise<FlagValues> | undefined;

  async function refresh(): Promise<FlagValues> {
    const at = clock.now();
    const flags = await settle(() => client.getEnvironmentFlags());
    const values = isAnswer(flags)
      ? readAll(flags, report)
      : (cached?.values ?? flagDefaults);
    cached = { values, at };
    return values;
  }

  return {
    environment: async (signal) => {
      if (
        cached !== undefined &&
        clock.now() - cached.at < environmentRefreshMs
      ) {
        return cached.values;
      }
      refreshing ??= refresh().finally(() => {
        refreshing = undefined;
      });
      return untilAborted(
        refreshing,
        signal,
        () => cached?.values ?? flagDefaults,
      );
    },
    forOrder: async (orderId, traits, signal) => {
      const identity = orderIdentity(orderId);
      const flags = signal?.aborted
        ? undefined
        : await callerSignal.run(signal, () =>
            settle(() =>
              client.getIdentityFlags(identity, identityTraits(traits)),
            ),
          );
      return decide(identity, traits, flags, report);
    },
    recordExposure: (decision) => {
      const { experiment } = decision;
      if (!decision.in_experiment || experiment === undefined) return;
      track(logger, () =>
        client.trackExposureEvent(experimentFlag, {
          identifier: decision.identity,
          value: experiment.variant,
          metadata: { experiment_id: experiment.id },
        }),
      );
    },
    recordConversion: (orderId) =>
      track(logger, () =>
        client.trackEvent(conversionEvent, {
          identifier: orderIdentity(orderId),
        }),
      ),
    close: (waitMs) => client.close(waitMs),
  };
}

function decide(
  identity: string,
  traits: OrderTraits,
  flags: SdkFlags | undefined,
  report: Report,
): OrderFlags {
  const segment = segmentFor(traits.language);
  if (!isAnswer(flags)) {
    return {
      identity,
      ops_reading: flagDefaults.ops_reading,
      cfg_sarvam: flagDefaults.cfg_sarvam,
      exp_reading_path: flagDefaults.exp_reading_path,
      in_experiment: false,
      cfg_demo_trace: flagDefaults.cfg_demo_trace,
      segment,
      from: "defaults",
    };
  }
  const pathFlag = flags.getFlag(experimentFlag);
  const path = readFlag(experimentFlag, pathFlag);
  if (path.problem !== undefined) report(experimentFlag, path.problem);
  const { enrolment, problem } = enrolmentFor(pathFlag, path);
  if (problem !== undefined) report(experimentFlag, problem);
  return {
    identity,
    ops_reading: valueOf("ops_reading", flags, report),
    cfg_sarvam: valueOf("cfg_sarvam", flags, report),
    exp_reading_path: path.value,
    in_experiment: enrolment !== undefined,
    ...(enrolment === undefined ? {} : { experiment: enrolment }),
    cfg_demo_trace: valueOf("cfg_demo_trace", flags, report),
    segment,
    from: "flagsmith",
  };
}

function readAll(flags: SdkFlags, report: Report): FlagValues {
  return Object.fromEntries(
    flagNames.map((name) => [name, valueOf(name, flags, report)]),
  ) as FlagValues;
}

function valueOf<Name extends FlagName>(
  name: Name,
  flags: SdkFlags,
  report: Report,
): FlagValues[Name] {
  const reading = readFlag(name, flags.getFlag(name));
  if (reading.problem !== undefined) report(name, reading.problem);
  return reading.value;
}

function track(logger: SdkLog, action: () => void): void {
  try {
    action();
  } catch (error) {
    logger.error(error, "the event was not recorded");
  }
}

function sdkLogger(log: Log, environmentKey: string): SdkLog {
  const clean = (text: string) =>
    text.replaceAll(environmentKey, "[environment key]");
  const write =
    (level: "error" | "warn"): Write =>
    (first, second) => {
      const detail =
        typeof first === "string"
          ? first
          : typeof second === "string"
            ? second
            : "";
      log({
        msg: "flagsmith",
        level,
        detail: clean(detail),
        ...(first instanceof Error ? { error: clean(errorText(first)) } : {}),
      });
    };
  const ignore: Write = () => {};
  const logger: SdkLog = {
    fatal: write("error"),
    error: write("error"),
    warn: write("warn"),
    info: ignore,
    debug: ignore,
    trace: ignore,
    silent: ignore,
    child: () => logger,
  };
  return logger;
}

function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  fallback: () => T,
): Promise<T> {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.resolve(fallback());
  return new Promise((resolve) => {
    const stop = () => resolve(fallback());
    signal.addEventListener("abort", stop, { once: true });
    void work
      .then(resolve, stop)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}

function isAnswer(flags: SdkFlags | undefined): flags is SdkFlags {
  return flags !== undefined && flags.allFlags().length > 0;
}

function identityTraits({ store, source, language, is_demo }: OrderTraits) {
  return { store, source, language: language ?? null, is_demo };
}

function errorText(error: Error): string {
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.name}: ${error.message}${cause}`;
}
