// Pattern seen in several Toggle Wars repos (written in our own words, not copied): the flag and event
// names live in constants, the visitor ID is kept in localStorage, and the conversion fires on a click.
import flagsmith from '@flagsmith/flagsmith';

const EXPERIMENT_FLAG = 'checkout_button';
const CONVERSION_EVENT = 'purchase';

function visitorId(): string {
  const saved = localStorage.getItem('visitor_id');
  if (saved) return saved;
  const created = crypto.randomUUID();
  localStorage.setItem('visitor_id', created);
  return created;
}

export async function startExperiment(button: HTMLButtonElement) {
  await flagsmith.init({ environmentID: 'YOUR_ENVIRONMENT_ID', enableEvents: true });
  await flagsmith.identify(visitorId());

  const flag = flagsmith.getExperimentFlag(EXPERIMENT_FLAG);
  button.textContent = flag?.value === 'buy' ? 'Buy now' : 'Checkout';

  button.addEventListener('click', async () => {
    flagsmith.trackEvent(CONVERSION_EVENT, { value: 49 });
    await flagsmith.flushEvents();
  });
  window.addEventListener('pagehide', () => {
    void flagsmith.flushEvents();
  });
}
