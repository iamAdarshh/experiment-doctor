// CreatorDigest test page: one A/B test on the headline, run by ExperimentPilot.
// Flagsmith decides which copy a visitor sees (multivariate flag), records the exposure where
// the headline is shown (getExperimentFlag), and receives one conversion event on click.
// The logic is exported so tests can drive it with fakes; it only touches the DOM in a browser.
import flagsmith from './vendor/flagsmith-12.6.0.mjs';
import * as committedConfig from './config.js';

// The metric's event name. Must equal the metric's definition.event exactly (case-sensitive).
export const CTA_EVENT = 'cta_clicked';

// Shown when Flagsmith is unreachable, too slow, or returns an unknown value.
export const FALLBACK_VALUE = 'control';

export const THANKS_TEXT = 'Thanks. This is a test page; nothing was stored.';

const VISITOR_ID_STORAGE_KEY = 'creatordigest_visitor_id';
const REAL_VISITOR_PREFIX = 'web_';
const FLAGSMITH_TIMEOUT_MS = 2000;

// Flag value -> page copy. The flag carries a short value; the words live here.
export const COPY = {
  control: {
    headline: 'Your creator digest, summarized by AI',
    subline: 'One short email a day with what the creators you follow posted.',
    example: null,
  },
  variant_b: {
    headline: "Yesterday's 5 biggest creator posts, in 60 seconds. See today's.",
    subline: 'Only the five posts that mattered from the creators you follow, three lines each.',
    example: 'Example: "A cooking channel you follow posted a 20-minute pasta video. The one tip: salt the water late. Key step at 4:10."',
  },
};

export function copyFor(value) {
  return typeof value === 'string' && Object.hasOwn(COPY, value) ? COPY[value] : COPY[FALLBACK_VALUE];
}

// One id per browser, used for identify(), the exposure and the event alike.
export function getVisitorId(storage, randomId = () => crypto.randomUUID()) {
  try {
    const saved = storage?.getItem(VISITOR_ID_STORAGE_KEY);
    if (typeof saved === 'string' && saved.startsWith(REAL_VISITOR_PREFIX)) return saved;
    const id = `${REAL_VISITOR_PREFIX}${randomId()}`;
    storage?.setItem(VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return `${REAL_VISITOR_PREFIX}${randomId()}`; // storage blocked: this id lasts for this page load only
  }
}

function render(document, value, source) {
  const copy = copyFor(value);
  const headline = document.getElementById('headline');
  headline.textContent = copy.headline;
  headline.classList.remove('pending');
  document.getElementById('subline').textContent = copy.subline;
  const example = document.getElementById('example');
  example.textContent = copy.example ?? '';
  example.hidden = !copy.example;
  document.body.dataset.variant = value;
  document.body.dataset.source = source;
}

export async function run({ document, flagsmith: sdk, config, storage, randomId, timeoutMs = FLAGSMITH_TIMEOUT_MS }) {
  const visitorId = getVisitorId(storage, randomId);
  let value = FALLBACK_VALUE;
  let source = 'fallback';
  let eventsOn = false;
  let timer;

  try {
    await Promise.race([
      (async () => {
        await sdk.init({ environmentID: config.FLAGSMITH_ENVIRONMENT_KEY, enableEvents: true });
        await sdk.identify(visitorId);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Flagsmith did not answer within ${timeoutMs} ms`)), timeoutMs); }),
    ]);
    // Called where the visitor sees the headline: this records the exposure.
    const flag = sdk.getExperimentFlag(config.FLAG_KEY);
    if (flag !== null) {
      eventsOn = true;
      source = 'flagsmith';
      if (typeof flag.value === 'string' && Object.hasOwn(COPY, flag.value)) value = flag.value;
    }
  } catch (err) {
    console.warn('Flagsmith unavailable; showing the fallback headline.', err?.message ?? err);
  } finally {
    clearTimeout(timer);
  }

  render(document, value, source);

  document.getElementById('cta').addEventListener('click', async () => {
    if (eventsOn) {
      sdk.trackEvent(CTA_EVENT, { identifier: visitorId }); // same id as identify()
      await sdk.flushEvents();
    }
    document.getElementById('message').textContent = THANKS_TEXT;
  });

  return { visitorId, value, source };
}

async function loadConfig() {
  try {
    return { ...committedConfig, ...(await import('./config.local.js')) };
  } catch {
    return { ...committedConfig }; // no local override (for example on GitHub Pages)
  }
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const config = await loadConfig();
  await run({ document, flagsmith, config, storage: browserStorage() });
  window.addEventListener('pagehide', () => { flagsmith.flushEvents(); });
}
