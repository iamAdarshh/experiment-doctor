// Flagsmith feature flags.
//
// The server evaluates flags locally (server-side key) and refreshes them every
// FLAGSMITH_REFRESH_SECONDS. When a flag changes in the Flagsmith dashboard, the
// new values are pushed to every connected phone at once over Socket.IO.
// (Flagsmith's own real-time streaming needs an Enterprise plan, so we don't use it.)
//
// Flags:
//   hichki        on/off  the Hichki button
//   jab_kholna    on/off  locked voice letters
//   ai_requests   on/off  off means typed requests only, no Sarvam call
//   request_mode  multivariate experiment per gathering: "room" or "nominee"

import { DefaultFlag, Flagsmith } from '@flagsmith/nodejs';
import { config } from './config.ts';
import { log } from './app.ts';
import { DEFAULT_PACKS, parsePacks, type Packs } from './packs.ts';

export type FlagState = { hichki: boolean; jab_kholna: boolean; ai_requests: boolean };
export type RequestMode = 'room' | 'nominee';

// Used before Flagsmith answers, when it can't be reached, or when no key is set.
const DEFAULTS: FlagState = { hichki: true, jab_kholna: true, ai_requests: true };

const { serverKey, apiUrl, refreshSeconds, experiments } = config.flagsmith;

export const flagsmithEnabled = serverKey.length > 0;

let current: FlagState = { ...DEFAULTS };
let source: 'flagsmith' | 'defaults' = 'defaults';
// Occasion packs, from the `request_packs` flag's value (see packs.ts).
let currentPacks: Packs = DEFAULT_PACKS;
const packListeners = new Set<(packs: Packs) => void>();
const listeners = new Set<(flags: FlagState) => void>();

const client = flagsmithEnabled
  ? new Flagsmith({
      environmentKey: serverKey,
      apiUrl,
      enableLocalEvaluation: true,
      environmentRefreshIntervalSeconds: refreshSeconds,
      enableAnalytics: true,
      enableEvents: experiments,
      requestTimeoutSeconds: 5,
      defaultFlagHandler: (name: string) =>
        new DefaultFlag(null, name in DEFAULTS ? DEFAULTS[name as keyof FlagState] : false),
      onEnvironmentChange: (error) => {
        if (error) {
          log.warn({ event: 'flagsmith_refresh_failed', err: error.message }, 'flagsmith refresh failed');
          return;
        }
        void refresh();
      },
    })
  : null;

async function refresh() {
  if (!client) return;
  try {
    const flags = await client.getEnvironmentFlags();
    const next: FlagState = {
      hichki: flags.isFeatureEnabled('hichki'),
      jab_kholna: flags.isFeatureEnabled('jab_kholna'),
      ai_requests: flags.isFeatureEnabled('ai_requests'),
    };
    source = 'flagsmith';

    const packs = (flags.isFeatureEnabled('request_packs') && parsePacks(flags.getFeatureValue('request_packs'))) || DEFAULT_PACKS;
    if (JSON.stringify(packs) !== JSON.stringify(currentPacks)) {
      log.info({ event: 'packs_changed', occasions: Object.keys(packs) }, 'occasion packs changed');
      currentPacks = packs;
      for (const listener of packListeners) listener(currentPacks);
    }

    if (JSON.stringify(next) !== JSON.stringify(current)) {
      log.info({ event: 'flags_changed', from: current, to: next }, 'flags changed');
      current = next;
      for (const listener of listeners) listener(current);
    }
  } catch (err) {
    log.warn({ event: 'flagsmith_read_failed', err: (err as Error).message }, 'flagsmith read failed');
  }
}

export async function startFlags() {
  if (!client) {
    log.info({ event: 'flags_defaults' }, 'FLAGSMITH_SERVER_SIDE_ENVIRONMENT_KEY not set, using default flags');
    return;
  }
  await refresh();
  log.info({ event: 'flags_ready', flags: current, refreshSeconds }, 'flagsmith ready');
}

export function flags(): FlagState {
  return current;
}

export function flagStatus() {
  return { source, flags: current, refreshSeconds: flagsmithEnabled ? refreshSeconds : null, experiments };
}

export function onFlagsChange(listener: (flags: FlagState) => void) {
  listeners.add(listener);
}

export function packs(): Packs {
  return currentPacks;
}

export function onPacksChange(listener: (packs: Packs) => void) {
  packListeners.add(listener);
}

// ---------------------------------------------------------------------------
// The request_mode experiment. The unit is the gathering: its id is the
// Flagsmith identity, so every request in one gathering gets the same variant.
// ---------------------------------------------------------------------------

function identity(gatheringId: string) {
  return `gathering_${gatheringId}`;
}

export async function requestMode(gatheringId: string): Promise<RequestMode> {
  if (!client) return 'room';
  try {
    const flag = experiments
      ? await client.getExperimentFlag('request_mode', identity(gatheringId))
      : (await client.getIdentityFlags(identity(gatheringId))).getFlag('request_mode');
    if (!flag.enabled) return 'room';
    return flag.value === 'nominee' ? 'nominee' : 'room';
  } catch (err) {
    log.warn({ event: 'request_mode_failed', err: (err as Error).message }, 'request_mode lookup failed');
    return 'room';
  }
}

// Conversion event for the experiment: how long a request took to be fulfilled.
export function trackFulfilled(gatheringId: string, seconds: number) {
  if (!client || !experiments) return;
  try {
    client.trackEvent('request_fulfilled', { identifier: identity(gatheringId), value: Math.round(seconds) });
  } catch (err) {
    log.warn({ event: 'track_event_failed', err: (err as Error).message }, 'trackEvent failed');
  }
}

export async function stopFlags() {
  await client?.close().catch(() => {});
}
