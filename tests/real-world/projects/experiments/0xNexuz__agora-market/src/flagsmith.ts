import flagsmith from '@flagsmith/flagsmith';
import { ENV_KEY, FLAG, VARIANTS } from './config';

export type Variant = (typeof VARIANTS)[keyof typeof VARIANTS];

export type Assignment = {
  variant: Variant;
  /** true when the variant came from a running Flagsmith experiment */
  live: boolean;
  shopperId: string;
  note?: string;
};

const ID_KEY = 'agora_shopper_id';

/** One stable id per browser, so exposures and conversions join up. */
function shopperId(): string {
  const fresh = `shopper_${crypto.randomUUID()}`;
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    localStorage.setItem(ID_KEY, fresh);
  } catch {
    // storage blocked (private mode, embedded view): fall back to a per-visit id
  }
  return fresh;
}

function asVariant(value: unknown): Variant {
  return value === VARIANTS.whatsapp ? VARIANTS.whatsapp : VARIANTS.cart;
}

/**
 * Identify the shopper and read the experiment flag. getExperimentFlag records
 * the exposure, so call this only where the order flow is actually shown.
 */
let pending: Promise<Assignment> | null = null;

export function assignShopper(): Promise<Assignment> {
  // React StrictMode runs effects twice in development; init only once.
  pending ??= assign();
  return pending;
}

async function assign(): Promise<Assignment> {
  const id = shopperId();

  // Local preview without Flagsmith: ?variant=whatsapp, nothing is tracked.
  const preview = new URLSearchParams(location.search).get('variant');
  if (!ENV_KEY) {
    return {
      variant: asVariant(preview),
      live: false,
      shopperId: id,
      note: 'Flagsmith key not set: preview mode, nothing is tracked.',
    };
  }

  try {
    await flagsmith.init({
      environmentID: ENV_KEY,
      identity: id,
      enableEvents: true,
      cacheFlags: false,
    });
    const flag = flagsmith.getExperimentFlag(FLAG);
    return {
      variant: asVariant(flag?.value),
      live: Boolean(flag?.experiment?.inExperiment),
      shopperId: id,
    };
  } catch (err) {
    console.error('[agora] Flagsmith init failed', err);
    return { variant: VARIANTS.cart, live: false, shopperId: id, note: 'Could not reach Flagsmith.' };
  }
}

/** Track an event and push it out now, before the shopper leaves the page. */
export async function track(event: string, value?: number): Promise<void> {
  if (!ENV_KEY) return;
  try {
    flagsmith.trackEvent(event, value === undefined ? undefined : { value });
    await flagsmith.flushEvents();
  } catch (err) {
    console.error('[agora] event not sent', err);
  }
}
