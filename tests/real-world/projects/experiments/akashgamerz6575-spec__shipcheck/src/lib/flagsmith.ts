/**
 * Flagsmith experiment wiring for ShipCheck.
 *
 * Experiment: `fix_workflow_mode`
 *   - `control`    → static diagnostic checklist
 *   - `guided_fix` → copyable README fix snippets
 * Metric: `fix_action_completed` (occurrence, direction up)
 *
 * Identity continuity is enforced here: one persistent anonymous `sc_<uuid>`
 * visitor id is created, passed to `identify()` BEFORE the experiment flag is
 * evaluated, and reused for every conversion event.
 */

import { createFlagsmithInstance } from '@flagsmith/flagsmith'
import type { IFlagsmith } from '@flagsmith/flagsmith'

export const EXPERIMENT_FLAG = 'fix_workflow_mode'
export const CONVERSION_EVENT = 'fix_action_completed'
export const VISITOR_STORAGE_KEY = 'shipcheck_visitor_id'
export const EXPERIMENT_HYPOTHESIS =
  'Adding an instant one-click copyable README fix snippet next to each failing readiness check (guided_fix) will increase the share of visitors who act on their scan (fix_action_completed) compared to a static diagnostic checklist (control).'

export type Variant = 'control' | 'guided_fix'
export type SdkStatus = 'loading' | 'connected' | 'fallback' | 'error'
export type VariantSource = 'flagsmith' | 'fallback' | 'preview'

const FALLBACK_VARIANT: Variant = 'control'
const ENV_KEY = String(import.meta.env.VITE_FLAGSMITH_ENV_KEY ?? '').trim()
const API_URL = String(import.meta.env.VITE_FLAGSMITH_API_URL ?? '').trim()
const INIT_TIMEOUT_MS = 8000

export function hasEnvKey(): boolean {
  return ENV_KEY.length > 0 && ENV_KEY !== 'your_client_side_environment_key'
}

function randomVisitorId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `sc_${uuid}`
}

/** Persistent anonymous identity — the only identifier ShipCheck ever sends. */
export function getOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY)
    if (existing && existing.startsWith('sc_')) return existing
    const created = randomVisitorId()
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created)
    return created
  } catch {
    // Private mode / storage disabled: still return a stable-for-session id.
    return randomVisitorId()
  }
}

/** Used by the Inspector "New Visitor Session" button to re-bucket live. */
export function regenerateVisitorId(): string {
  const created = randomVisitorId()
  try {
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created)
  } catch {
    // ignore storage failures
  }
  return created
}

/**
 * Dev-only manual override: `?preview_variant=guided_fix`.
 * `import.meta.env.DEV` is statically false in production builds, so the whole
 * branch is tree-shaken out of the deployed bundle.
 */
export function readPreviewOverride(): Variant | null {
  if (!import.meta.env.DEV) return null
  try {
    const value = new URLSearchParams(window.location.search).get('preview_variant')
    if (value === 'guided_fix' || value === 'control') return value
  } catch {
    return null
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Flagsmith init timed out')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export interface Evaluation {
  variant: Variant
  source: VariantSource
  exposureRecorded: boolean
  inExperiment: boolean
}

export class ShipCheckExperiment {
  readonly visitorId: string
  private client: IFlagsmith | null = null
  private initPromise: Promise<SdkStatus> | null = null
  private status: SdkStatus = 'loading'
  private lastVariant: Variant = FALLBACK_VARIANT

  constructor(visitorId: string) {
    this.visitorId = visitorId
  }

  /** Initialise once, identify the visitor, then resolve the SDK status. */
  init(): Promise<SdkStatus> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<SdkStatus> {
    if (!hasEnvKey()) {
      this.status = 'fallback'
      return this.status
    }

    const client = createFlagsmithInstance()
    this.client = client

    try {
      await withTimeout(
        client.init({
          environmentID: ENV_KEY,
          api: API_URL || undefined,
          enableEvents: true,
          cacheFlags: false,
          defaultFlags: {
            [EXPERIMENT_FLAG]: { enabled: true, value: FALLBACK_VARIANT },
          },
          onError: () => {
            // Swallow SDK noise; the UI already discloses fallback status.
          },
        }),
        INIT_TIMEOUT_MS,
      )

      // Identity must be set BEFORE any experiment flag is evaluated.
      await withTimeout(client.identify(this.visitorId), INIT_TIMEOUT_MS)

      if (!client.initialised) {
        this.status = 'fallback'
        return this.status
      }

      this.status = 'connected'
      return this.status
    } catch {
      this.client = null
      this.status = 'error'
      return this.status
    }
  }

  getStatus(): SdkStatus {
    return this.status
  }

  /**
   * Called at the moment the scan result is rendered, so exposures reflect real
   * scans instead of page bounces. `getExperimentFlag` records the
   * `$flag_exposure` event for enrolled identities.
   */
  async evaluate(): Promise<Evaluation> {
    const preview = readPreviewOverride()
    if (preview) {
      this.lastVariant = preview
      return {
        variant: preview,
        source: 'preview',
        exposureRecorded: false,
        inExperiment: false,
      }
    }

    const status = await this.init()
    if (status !== 'connected' || !this.client) {
      this.lastVariant = FALLBACK_VARIANT
      return {
        variant: FALLBACK_VARIANT,
        source: 'fallback',
        exposureRecorded: false,
        inExperiment: false,
      }
    }

    try {
      const flag = this.client.getExperimentFlag(EXPERIMENT_FLAG)
      const value = flag?.value
      const variant: Variant = value === 'guided_fix' ? 'guided_fix' : 'control'
      this.lastVariant = variant
      const inExperiment = Boolean(
        flag?.experiment?.inExperiment ||
          flag?.reason?.toLowerCase().includes('experiment') ||
          (flag?.variant && flag.variant !== 'default') ||
          flag?.enabled,
      )
      if (inExperiment) {
        // Ensure the exposure leaves the buffer immediately for demos.
        void this.client.flushEvents()
      }
      return {
        variant,
        source: 'flagsmith',
        exposureRecorded: inExperiment,
        inExperiment,
      }
    } catch {
      this.lastVariant = FALLBACK_VARIANT
      return {
        variant: FALLBACK_VARIANT,
        source: 'fallback',
        exposureRecorded: false,
        inExperiment: false,
      }
    }
  }

  /**
   * Fire the primary metric with the exact same visitor identity, then flush.
   * Returns true only when the event was actually handed to a connected SDK.
   */
  async trackFixCompleted(action: string, repo: string): Promise<boolean> {
    if (this.status !== 'connected' || !this.client) return false
    try {
      this.client.trackEvent(CONVERSION_EVENT, {
        identifier: this.visitorId,
        metadata: {
          variant: this.lastVariant,
          action,
          repo,
        },
      })
      await this.client.flushEvents()
      return true
    } catch {
      return false
    }
  }

  /** Best-effort flush for `pagehide` / `beforeunload`. */
  flushOnExit(): void {
    if (!this.client) return
    try {
      void this.client.flushEvents()
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.close(2000)
    } catch {
      // ignore
    }
  }
}

export function formatVisitorId(visitorId: string): string {
  if (visitorId.length <= 18) return visitorId
  return `${visitorId.slice(0, 11)}…${visitorId.slice(-6)}`
}
