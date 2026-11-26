import { createFlagsmithInstance, type IFlagsmith, type IFlagsmithFeature } from '@flagsmith/flagsmith';

export type ExperimentVariant = 'guided' | 'self-guided';
export type ExperimentEvent = 'started' | 'first_success' | 'hint_opened';
export type ExperimentState = {
  status: 'live' | 'offline' | 'error';
  variant: ExperimentVariant;
  identity: string;
  message: string;
  experimentId?: number;
  exposed: boolean;
  delivery: 'idle' | 'queued' | 'accepted' | 'retrying';
};

export const EXPERIMENT_EVENTS: Record<ExperimentEvent, string> = {
  started: 'quest_started',
  first_success: 'quest_first_success',
  hint_opened: 'quest_hint_opened',
};

type Environment = Record<string, string | undefined>;
type Dependencies = {
  sdk?: IFlagsmith;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  fetch?: typeof fetch;
  randomId?: () => string;
  preview?: ExperimentVariant;
};

/** Recognise only the two treatments described in the registered experiment. */
export function assignmentFromFlag(flag: IFlagsmithFeature | undefined): ExperimentVariant | null {
  if (!flag?.enabled || !flag.experiment?.inExperiment || !flag.variant) return null;
  return flag.value === 'guided' || flag.value === 'self-guided' ? flag.value : null;
}

/** A factory keeps transport and storage injectable for failure-path tests. */
export function createExperimentService(env: Environment, dependencies: Dependencies = {}) {
  const sdk = dependencies.sdk ?? createFlagsmithInstance();
  const featureName = env.VITE_FLAGSMITH_FLAG_NAME?.trim() || 'quest_guidance';
  const environmentId = env.VITE_FLAGSMITH_ENVIRONMENT_ID?.trim();
  const eventsBase = env.VITE_FLAGSMITH_EVENTS_URL?.trim() || 'https://events.api.flagsmith.com/';
  let storage = dependencies.storage;
  if (!storage && typeof window !== 'undefined') {
    try { storage = window.localStorage; } catch { /* Storage can be disabled by browser policy. */ }
  }
  const listeners = new Set<(state: ExperimentState) => void>();
  let state: ExperimentState = {
    status: 'offline', variant: dependencies.preview ?? 'guided', identity: 'preview',
    message: 'Practice preview — no live experiment or event collection.',
    exposed: false, delivery: 'idle',
  };
  let initialization: Promise<ExperimentState> | undefined;
  const recorded = new Set<ExperimentEvent>();
  const snapshot = () => ({ ...state });
  const update = (patch: Partial<ExperimentState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(snapshot());
    return snapshot();
  };

  const transport: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const eventRequest = url.startsWith(eventsBase);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const relayAbort = () => controller.abort();
    if (init?.signal?.aborted) controller.abort();
    init?.signal?.addEventListener('abort', relayAbort, { once: true });
    try {
      const response = await (dependencies.fetch ?? fetch)(input, { ...init, signal: controller.signal });
      if (eventRequest) update({ delivery: response.ok ? 'accepted' : 'retrying' });
      return response;
    } catch (error) {
      if (eventRequest) update({ delivery: 'retrying' });
      throw error;
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener('abort', relayAbort);
    }
  };

  async function initialize(): Promise<ExperimentState> {
    if (initialization) return initialization;
    initialization = (async () => {
      // Explicit preview never fetches flags or sends events, even in a configured deployment.
      if (dependencies.preview || !environmentId) return snapshot();
      try {
        const storageKey = `lantern-road:experiment-identity:${environmentId}`;
        let identity: string | null = null;
        try { identity = storage?.getItem(storageKey) ?? null; } catch { /* Session-only identity. */ }
        if (!identity || !/^quest_[a-zA-Z0-9-]{10,80}$/.test(identity)) {
          identity = `quest_${(dependencies.randomId ?? (() => crypto.randomUUID()))()}`;
          try { storage?.setItem(storageKey, identity); } catch { /* Session-only identity. */ }
        }
        await sdk.init({
          environmentID: environmentId,
          identity,
          enableEvents: true,
          enableAnalytics: false,
          cacheFlags: false,
          fetch: transport,
          ...(env.VITE_FLAGSMITH_API_URL ? { api: env.VITE_FLAGSMITH_API_URL } : {}),
          eventProcessorConfig: { eventsApiUrl: eventsBase, flushInterval: 2_000, maxBuffer: 20 },
          applicationMetadata: { name: 'lantern-road-contest', version: '1.0.0' },
        });
        const flag = sdk.getAllFlags()[featureName]; // Reading is not an exposure.
        const variant = assignmentFromFlag(flag);
        if (!variant || sdk.loadingState?.source !== 'SERVER') {
          await sdk.close(250);
          return update({
            status: 'offline',
            message: 'Practice preview — Flagsmith has not enrolled this browser in a running guidance experiment. No experiment events are recorded.',
          });
        }
        return update({
          status: 'live', variant, identity, experimentId: flag.experiment!.id,
          message: 'Flagsmith assigned this challenge. Anonymous exposure and completion events measure the guidance experiment.',
        });
      } catch {
        await sdk.close(250);
        return update({ status: 'error', message: 'Flagsmith is unavailable. You can still practise; this session is not counted as an experiment.' });
      }
    })();
    return initialization;
  }

  function recordExposure(): boolean {
    if (state.status !== 'live' || state.exposed) return false;
    // Call only after the challenge renders its assigned guidance treatment.
    // getExperimentFlag validates server freshness and experiment enrollment.
    const flag = sdk.getExperimentFlag(featureName);
    if (assignmentFromFlag(flag ?? undefined) !== state.variant) return false;
    update({ exposed: true, delivery: 'queued' });
    void sdk.flushEvents();
    return true;
  }

  function track(event: ExperimentEvent, metadata: { challengeId?: string; attempts?: number } = {}): boolean {
    if (state.status !== 'live' || !state.exposed) return false;
    // Count starts/success once per page session. The occurrence metric also deduplicates per identity.
    if (event !== 'hint_opened' && recorded.has(event)) return false;
    if (event === 'first_success' && !recorded.has('started')) return false;
    if (event === 'hint_opened' && state.variant !== 'guided') return false;
    const safeMetadata: Record<string, unknown> = { experiment_id: state.experimentId, variant: state.variant };
    if (metadata.challengeId) safeMetadata.challenge_id = metadata.challengeId.slice(0, 80);
    if (typeof metadata.attempts === 'number' && Number.isFinite(metadata.attempts)) safeMetadata.attempts = Math.max(0, Math.floor(metadata.attempts));
    sdk.trackEvent(EXPERIMENT_EVENTS[event], { metadata: safeMetadata });
    recorded.add(event);
    update({ delivery: 'queued' });
    // The official SDK owns buffering and retry; flush success does not claim warehouse ingestion.
    void sdk.flushEvents();
    return true;
  }

  return {
    initialize,
    recordExposure,
    track,
    getState: snapshot,
    subscribe(listener: (next: ExperimentState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    flush: () => state.status === 'live' ? sdk.flushEvents() : Promise.resolve(),
    close: () => sdk.close(1_000),
  };
}

const runtimeEnv = (import.meta as ImportMeta & { env?: Environment }).env ?? {};
let preview: ExperimentVariant | undefined;
if (typeof window !== 'undefined') {
  const query = new URLSearchParams(window.location.search).get('preview');
  if (query === 'guided' || query === 'self-guided') preview = query;
}
const experiment = createExperimentService(runtimeEnv, { preview });

export const initializeExperiment = experiment.initialize;
export const recordExperimentExposure = experiment.recordExposure;
export const trackExperimentEvent = experiment.track;
export const getExperimentState = experiment.getState;
export const subscribeExperiment = experiment.subscribe;
export const flushExperimentEvents = experiment.flush;

if (typeof window !== 'undefined') {
  // Flushing promptly on conversion is primary. These are best-effort lifecycle flushes.
  window.addEventListener('pagehide', () => { void experiment.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void experiment.flush();
  });
}
