import flagsmith from '@flagsmith/flagsmith';
import { FLAG_KEY, CONVERSION_EVENT, normaliseVariant } from './experiment.js';
import { RENDERERS } from './variants.js';

const ENV_KEY = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_KEY;
const API_URL = import.meta.env.VITE_FLAGSMITH_API_URL; // self-hosted only
const EVENTS_URL = import.meta.env.VITE_FLAGSMITH_EVENTS_URL; // self-hosted only

const params = new URLSearchParams(location.search);
const root = document.getElementById('install');
const debug = document.getElementById('debug');

// Experiments join exposures and conversions per identity, so every visitor gets a
// stable anonymous id. `?visitor=new` forces a fresh one (handy when recording the demo).
function visitorId() {
  const KEY = 'install-ab-visitor';
  let id = null;
  try {
    if (params.get('visitor') !== 'new') id = localStorage.getItem(KEY);
  } catch {}
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    try { localStorage.setItem(KEY, id); } catch {}
  }
  return id;
}

function showDebug(lines) {
  if (!params.has('debug')) return;
  debug.hidden = false;
  debug.textContent = lines.join('  ·  ');
}

async function start() {
  const identity = visitorId();

  // Dev-only preview of a version (`?variant=steps`). It skips Flagsmith entirely, so it
  // records no exposure or conversion and cannot pollute the experiment.
  const forced = params.get('variant');
  if (import.meta.env.DEV && RENDERERS[forced]) {
    RENDERERS[forced](root, (d) => console.info('[install-ab] preview copy (not tracked)', d));
    showDebug([`preview of ${forced}: not tracked`]);
    return;
  }

  if (!ENV_KEY) {
    RENDERERS.one_liner(root);
    showDebug(['No VITE_FLAGSMITH_ENVIRONMENT_KEY set: showing control, no events sent']);
    console.warn('[install-ab] Set VITE_FLAGSMITH_ENVIRONMENT_KEY in .env');
    return;
  }

  try {
    await flagsmith.init({
      environmentID: ENV_KEY,
      identity,
      enableEvents: true,
      ...(API_URL && { api: API_URL }),
      ...(EVENTS_URL && { eventProcessorConfig: { eventsApiUrl: EVENTS_URL } }),
    });
  } catch (err) {
    console.error('[install-ab] Flagsmith init failed, falling back to control', err);
  }

  // getExperimentFlag records the `$flag_exposure` event when this identity is enrolled.
  const flag = flagsmith.getExperimentFlag(FLAG_KEY);
  const variant = normaliseVariant(flag?.value);

  RENDERERS[variant](root, (details) => {
    flagsmith.trackEvent(CONVERSION_EVENT, { metadata: { variant, ...details } });
    flagsmith.flushEvents(); // don't wait for the 10 s batch if the visitor leaves
  });

  showDebug([
    `identity ${identity}`,
    `value ${flag?.value ?? '(none)'}`,
    `variant key ${flag?.variant ?? '(none)'}`,
    `in experiment ${flag?.experiment?.inExperiment ?? false}`,
  ]);
}

start();
