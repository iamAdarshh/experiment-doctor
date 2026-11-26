// Exposure rules (EXPERIMENT.md sections 3.2 and 3.4). trackExposureEvent fires once per session, only when
// the flag value came from the Flagsmith server, and never from the default handler, the 1.5 s timeout,
// a cache, an internal session or a test- identity. No SDK import here, so it is unit-testable.

export type Style = 'explain_first' | 'fix_first'

/** What the app knows about the flag after init (built in flagsmith.ts). */
export interface ExperimentState {
  identity: string
  style: Style
  /** loadingState.source === 'SERVER' within the timeout. CACHE and DEFAULT_FLAGS are not server. */
  fromServer: boolean
  /** flag.experiment.inExperiment: this identity is enrolled in a running experiment. */
  inExperiment: boolean
  /** flag.variant, sent as the exposure value (the control's variant string is unverified, see docs/sdk-facts.md). */
  variant: string | undefined
  experimentId: number | undefined
  /** Test identity (test- prefix) or ?internal=1 session. */
  excluded: boolean
  /** Visitor chose "Don't track me". */
  optedOut: boolean
}

/** Pure gate for the exposure. Layouts never depend on anything but `style`, which the state fixes once. */
export function shouldTrackExposure(s: ExperimentState): boolean {
  return s.fromServer && s.inExperiment && !s.excluded && !s.optedOut
}

export interface ExposurePayload {
  value: string | undefined
  experimentId: number | undefined
}

export interface ExposureTracker {
  /** Call when the first finding card is about to render. Returns true only the one time it sends. */
  trackOnce: (state: ExperimentState) => boolean
  readonly sent: boolean
}

/** One tracker per session. `send` makes the SDK call; a throw in it is swallowed (never breaks rendering). */
export function createExposureTracker(send: (payload: ExposurePayload) => void): ExposureTracker {
  let sent = false
  return {
    trackOnce(state) {
      if (sent || !shouldTrackExposure(state)) return false
      sent = true // latch first: a failing send is not retried, so an exposure is never doubled
      try {
        send({ value: state.variant, experimentId: state.experimentId })
      } catch {
        return false
      }
      return true
    },
    get sent() {
      return sent
    },
  }
}
