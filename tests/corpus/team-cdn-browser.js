// Pattern seen in a Toggle Wars repo (our own words): plain JavaScript, the SDK imported from a CDN with a
// pinned version, no build step and no package.json.
import flagsmith from 'https://cdn.jsdelivr.net/npm/@flagsmith/flagsmith@12.6.0/+esm';

await flagsmith.init({ environmentID: window.FLAGSMITH_ENVIRONMENT_ID, enableEvents: true });
await flagsmith.identify(localStorage.getItem('visitor') ?? 'anonymous-visitor');

const flag = flagsmith.getExperimentFlag('cta_copy');
document.querySelector('#cta').textContent = flag?.value ?? 'Start free';

document.querySelector('#cta').addEventListener('click', async () => {
  flagsmith.trackEvent('purchase');
  await flagsmith.flushEvents();
});
window.addEventListener('pagehide', () => flagsmith.flushEvents());
