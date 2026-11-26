import flagsmith from '@flagsmith/flagsmith';
// Inter ships with the page (OFL licence), so it looks the same on a Mac and on a Linux CI runner.
import '@fontsource-variable/inter';

// Flagshots opens this page once per flag variant and adds ?flagshots_identity=<name>.
// Passing that name to Flagsmith as the user's identity is the only change an app needs:
// Flagsmith then answers with the override Flagshots set for that identity.
// Without the parameter the page loads like it would for any visitor.
const identity = new URLSearchParams(window.location.search).get('flagshots_identity');

function render() {
  const root = document.documentElement;

  // hero_layout is multivariate: its value picks one of three hero layouts.
  root.dataset.heroLayout = flagsmith.getValue('hero_layout') ?? 'classic';

  // dark_mode and pricing_badge are plain on/off flags.
  root.dataset.theme = flagsmith.hasFeature('dark_mode') ? 'dark' : 'light';
  document.querySelector('[data-flag="pricing_badge"]').hidden = !flagsmith.hasFeature('pricing_badge');

  // checkout_button_copy holds the label for the sign-up buttons.
  const copy = flagsmith.getValue('checkout_button_copy');
  if (copy) {
    for (const button of document.querySelectorAll('[data-checkout-copy]')) {
      button.textContent = copy;
    }
  }

  // Tells Flagshots the page has drawn with its flags, so the screenshot can be taken.
  root.dataset.flagsReady = 'true';
}

await flagsmith.init({
  environmentID: import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_KEY,
  api: import.meta.env.VITE_FLAGSMITH_API_URL ?? 'http://localhost:8000/api/v1/',
  identity: identity ?? undefined,
  // Always ask Flagsmith, so a screenshot never shows flags cached from an earlier load.
  cacheFlags: false,
  enableAnalytics: false,
  onError: (err) => console.error('Flagsmith could not load flags', err),
});
render();
