// Browser SDK wiring (the only file that talks to @flagsmith/flagsmith). See docs/sdk-facts.md.
// - Identity is passed in init, so identity-scoped flags are loaded before anything renders.
// - The SDK has no init timeout: we race it against flagTimeoutMs. After the timeout (or any failure) the
//   session is frozen on explain_first from the default handler and never tracks an exposure.
// - The flag is read with getAllFlags(), NOT getExperimentFlag (which would record its own exposure).
// - With no environment key, nothing is initialised or tracked and the app runs on the control layout.
import flagsmith from '@flagsmith/flagsmith'
import config from '../../experiment.config.json'
import { createExposureTracker } from './exposure.ts'
import type { ExperimentState, Style } from './exposure.ts'
import { getIdentity, isExcludedIdentity, isInternalSession } from './identity.ts'
import type { MetricName } from './metrics.ts'

export type { ExperimentState, Style } from './exposure.ts'

const FLAG = config.flag
const CONTROL_STYLE: Style = 'explain_first'
const OPT_OUT_KEY = 'lintmus_optout'

/** Enrolment gate: only identities in a running experiment get an exposure (flip to false to test pre-start). */
export const REQUIRE_IN_EXPERIMENT = true

const ENV_KEY: string = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_KEY ?? ''
const API_URL: string | undefined = import.meta.env.VITE_FLAGSMITH_API_URL || undefined
const EVENTS_URL: string | undefined = import.meta.env.VITE_FLAGSMITH_EVENTS_API_URL || undefined

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch {
    return false
  }
}

export function setOptedOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch {
    // storage blocked: the choice lasts only for this page load
  }
  optedOutThisPage = value
}
let optedOutThisPage = false
const optedOut = () => optedOutThisPage || isOptedOut()

function baseState(identity: string): ExperimentState {
  return {
    identity,
    style: CONTROL_STYLE,
    fromServer: false,
    inExperiment: false,
    variant: undefined,
    experimentId: undefined,
    excluded: isExcludedIdentity(identity, config.excludedIdentityPrefix) || isInternalSession(location.search, config.internalQueryParam),
    optedOut: optedOut(),
  }
}

let sdkLive = false
let statePromise: Promise<ExperimentState> | null = null

/** Resolve the experiment state once per page load, within flagTimeoutMs. Never rejects. */
export function initExperiment(): Promise<ExperimentState> {
  statePromise ??= start()
  return statePromise
}

async function start(): Promise<ExperimentState> {
  const identity = getIdentity()
  const fallback = baseState(identity)
  if (!ENV_KEY) return fallback // no key: control layout, nothing tracked

  const init = flagsmith.init({
    environmentID: ENV_KEY,
    identity,
    enableEvents: true,
    cacheFlags: false, // a cached value is not a server value
    // The default handler: used whenever no server value is available. Always the control.
    defaultFlags: { [FLAG]: { enabled: true, value: CONTROL_STYLE } },
    ...(API_URL ? { api: API_URL } : {}),
    ...(EVENTS_URL ? { eventProcessorConfig: { eventsApiUrl: EVENTS_URL } } : {}),
    onError: () => {
      // init may still resolve from the default handler; loadingState.source then is not SERVER
    },
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), config.flagTimeoutMs)
  })
  let outcome: 'done' | 'timeout' | 'error'
  try {
    outcome = await Promise.race([init.then(() => 'done' as const), timeout])
  } catch {
    outcome = 'error'
  } finally {
    clearTimeout(timer)
  }
  if (outcome === 'done') installFlushOnHide()
  sdkLive = outcome === 'done'
  if (outcome !== 'done') return fallback // timed out or failed: frozen on the default, no exposure, ever

  // loadingState.source is the only reliable way to tell a server value from the default handler or a cache.
  const fromServer = String(flagsmith.loadingState?.source) === 'SERVER'
  const flag = flagsmith.getAllFlags()[FLAG]
  const style: Style = fromServer && flag?.enabled && flag.value === config.variation.value ? 'fix_first' : CONTROL_STYLE
  return {
    ...fallback,
    style,
    fromServer,
    inExperiment: REQUIRE_IN_EXPERIMENT ? flag?.experiment?.inExperiment === true : true,
    variant: flag?.variant,
    experimentId: flag?.experiment?.id,
  }
}

/** The SDK has no pagehide/visibilitychange handling: flush buffered events ourselves. */
function installFlushOnHide(): void {
  const flush = () => {
    try {
      void flagsmith.flushEvents().catch(() => {})
    } catch {
      // never let a flush break the page
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return flush() // back/forward cache: the page may come back, keep the SDK alive
    try {
      void flagsmith.close(1000).catch(() => {}) // browser close() needs timeoutMs
    } catch {
      flush()
    }
  })
}

/** The state with the visitor's current opt-out choice applied (they may opt out after init). */
export const withCurrentOptOut = (s: ExperimentState): ExperimentState => ({ ...s, optedOut: optedOut() })

/** Session-wide exposure tracker. FindingList calls trackOnce when the first finding card is about to render. */
export const exposure = createExposureTracker(({ value, experimentId }) => {
  flagsmith.trackExposureEvent(FLAG, {
    value,
    metadata: experimentId === undefined ? undefined : { experiment_id: experimentId },
  })
})

/** Send one metric event (Flagsmith Occurrence metric). Silent no-op when tracking is off. */
export function sendMetric(name: MetricName, state: ExperimentState | null): boolean {
  if (!state || !sdkLive || !state.fromServer || isInternalSession(location.search, config.internalQueryParam) || optedOut()) return false
  try {
    flagsmith.trackEvent(name)
    return true
  } catch {
    return false
  }
}

/** True when a Flagsmith environment key is configured (the app shows a note in the footer otherwise). */
export const trackingConfigured = ENV_KEY !== ''
