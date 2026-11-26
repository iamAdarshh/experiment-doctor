/**
 * Everything the worker needs from Flagsmith, behind one small interface so the
 * processor can be tested without a server.
 *
 * The Flagsmith implementation uses local evaluation: the SDK downloads the
 * environment (flags, experiment split) every few seconds with a server-side
 * key and evaluates each customer in memory. That means zero flag requests per
 * job, which also keeps a Flagsmith Cloud free plan far below its monthly
 * request cap. Exposures and metric events go to the events API in batches.
 */
import { DefaultFlag, Flag, Flagsmith } from '@flagsmith/nodejs';
import {
  CONTROL_VALUE,
  EVENT_429S,
  EVENT_LATENCY,
  EVENT_ON_TIME,
  KILL_SWITCH_FLAG,
  STRATEGY_FLAG,
  parseStrategy,
  type Strategy,
} from '../experiment.js';

export interface JobMetrics {
  customerId: string;
  onTime: boolean;
  rateLimited: number;
  latencyMs: number;
}

export interface ExperimentGateway {
  /** The strategy this customer gets. Records an exposure the first time a customer is enrolled. */
  strategyFor(customerId: string): Promise<Strategy>;
  /** Kill switch state. */
  isPaused(): Promise<boolean>;
  /** Sends the per-job metric events. */
  recordJob(m: JobMetrics): void;
  close(): Promise<void>;
}

export interface FlagsmithGatewayOptions {
  serverKey: string;
  apiUrl: string;
  /** Flagsmith API URL ending in /api/ when events are stored in the Flagsmith database. */
  eventsApiUrl?: string;
  refreshSeconds?: number;
}

export class FlagsmithGateway implements ExperimentGateway {
  private readonly client: Flagsmith;
  private readonly exposed = new Set<string>();

  constructor(opts: FlagsmithGatewayOptions) {
    this.client = new Flagsmith({
      environmentKey: opts.serverKey,
      apiUrl: opts.apiUrl,
      enableLocalEvaluation: true,
      environmentRefreshIntervalSeconds: opts.refreshSeconds ?? 5,
      enableEvents: true,
      ...(opts.eventsApiUrl ? { eventProcessorConfig: { eventsApiUrl: opts.eventsApiUrl } } : {}),
      // If Flagsmith cannot be reached: everyone gets the control, nobody is paused.
      defaultFlagHandler: (key: string) =>
        key === STRATEGY_FLAG ? new DefaultFlag(CONTROL_VALUE, true) : new DefaultFlag(undefined, false),
    });
  }

  async strategyFor(customerId: string): Promise<Strategy> {
    const flag = (await this.client.getIdentityFlags(customerId)).getFlag(STRATEGY_FLAG);
    // Evaluate without recording, then record one exposure per customer at the point
    // where the strategy is actually used (Flagsmith dedupes exposures per identity too).
    if (flag instanceof Flag && flag.experiment?.inExperiment && !this.exposed.has(customerId)) {
      this.client.trackExposureEvent(STRATEGY_FLAG, { identifier: customerId, value: flag.variant });
      this.exposed.add(customerId);
    }
    return parseStrategy(flag.value);
  }

  async isPaused(): Promise<boolean> {
    return (await this.client.getEnvironmentFlags()).isFeatureEnabled(KILL_SWITCH_FLAG);
  }

  recordJob(m: JobMetrics): void {
    const identifier = m.customerId;
    this.client.trackEvent(EVENT_ON_TIME, { identifier, value: m.onTime ? 1 : 0 });
    this.client.trackEvent(EVENT_429S, { identifier, value: m.rateLimited });
    this.client.trackEvent(EVENT_LATENCY, { identifier, value: Math.round(m.latencyMs / 100) / 10 });
  }

  async close(): Promise<void> {
    await this.client.close(10_000);
  }
}
