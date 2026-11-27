// All browser-side Flagsmith calls live here (and nowhere else besides components/FlagsmithProvider.tsx).
// SDK: @flagsmith/flagsmith 12.6.0. Method names checked against its types.d.ts and
// https://docs.flagsmith.com/experimentation/run-an-experiment
//
// Rules this file follows (CLAUDE.md, REVIEW.md):
// - enableEvents: true, and identify(visitorId) before any experiment call.
// - The exposure (getExperimentFlag) happens only when the first issue list is shown.
// - Event names match the metric names exactly.
// - Every event carries metadata.engine_version; flushEvents() after conversions and on pagehide.
// - Only the visitor ID, the flag read and these events reach Flagsmith. Never pasted code or issues.

import flagsmith from '@flagsmith/flagsmith';
import { ENGINE_VERSION } from './doctor';
import type { ExperimentEvent } from './scan-session';

export const EXPERIMENT_FLAG = 'fix_presentation';
export type Presentation = 'issues' | 'patch';

const READY_TIMEOUT_MS = 4000;
let ready: Promise<boolean> | null = null;

/** Starts the SDK once. Resolves true when flags are loaded for the identified visitor, false on failure. */
export function startFlagsmith(environmentID: string, visitorId: string): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    try {
      await flagsmith.init({
        environmentID,
        enableEvents: true,
      });
      await flagsmith.identify(visitorId);
      window.addEventListener('pagehide', () => {
        void flagsmith.flushEvents();
      });
      return true;
    } catch (error) {
      console.warn('[experiment] Flagsmith failed to start; showing the default view without the experiment.', error);
      return false;
    }
  })();
  return ready;
}

export function isDemoButtonEnabled(fallback: boolean): boolean {
  return flagsmith.hasFeature('show_demo_button', { fallback });
}

function withTimeout(promise: Promise<boolean>): Promise<boolean> {
  return Promise.race([promise, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), READY_TIMEOUT_MS))]);
}

/**
 * Records the exposure and returns the arm. Call this only when the first issue list is about to render.
 * If Flagsmith isn't configured or doesn't load in time, the visitor sees control and is NOT enrolled
 * (no exposure is sent), so they don't count in the experiment.
 */
export async function enrollAndGetPresentation(): Promise<Presentation> {
  if (!ready || !(await withTimeout(ready))) return 'issues';
  const flag = flagsmith.getExperimentFlag(EXPERIMENT_FLAG);
  return flag?.value === 'patch' ? 'patch' : 'issues';
}

/** Sends the events produced by one scan (see lib/scan-session.ts), then flushes if it was a conversion. */
export async function sendScanEvents(events: ExperimentEvent[]): Promise<void> {
  if (!ready || !(await ready) || events.length === 0) return;
  const metadata = { engine_version: ENGINE_VERSION };
  for (const event of events) {
    // Literal event names on purpose: `npm run doctor:self` then checks them against the metric list.
    if (event.name === 'rescan_count') flagsmith.trackEvent('rescan_count', { metadata });
    if (event.name === 'rescan_clean') flagsmith.trackEvent('rescan_clean', { metadata });
    if (event.name === 'minutes_to_clean') flagsmith.trackEvent('minutes_to_clean', { value: event.value, metadata });
  }
  if (events.some((event) => event.name === 'rescan_clean')) await flagsmith.flushEvents();
}

/** Logged for the story only: just the patch arm can fire it, so it is not an experiment metric. */
export async function sendPatchCopied(): Promise<void> {
  if (!ready || !(await ready)) return;
  flagsmith.trackEvent('patch_copied', { metadata: { engine_version: ENGINE_VERSION } });
  await flagsmith.flushEvents();
}
