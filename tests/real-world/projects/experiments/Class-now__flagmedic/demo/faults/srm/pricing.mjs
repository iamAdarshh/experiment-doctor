// Demo app, broken on purpose (scenario 2): the "bold" variation renders a lazily-loaded hero banner,
// and the exposure is only recorded once the banner has rendered. Visitors who leave while it loads
// are never counted, so "bold" is under-counted and the split drifts from 50/50.
import { Flagsmith } from '@flagsmith/nodejs';

export function createClient() {
  return new Flagsmith({
    environmentKey: process.env.FLAGSMITH_SERVER_KEY,
    enableEvents: true,
  });
}

const COPY = {
  control: 'See plans',
  bold: 'Ship faster today',
};

// Simulated lazy chunk: about 15% of visitors leave before it arrives.
async function loadHeroBanner(userId) {
  let h = 0;
  for (const c of userId) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h % 100 >= 15;
}

export async function renderPricing(flagsmith, userId) {
  const flags = await flagsmith.getIdentityFlags(userId);
  const value = flags.getFeatureValue('hero_cta');
  const variant = value === 'bold' ? 'bold' : 'control';
  if (variant === 'bold') {
    const rendered = await loadHeroBanner(userId);
    if (!rendered) return null;
  }
  flagsmith.trackExposureEvent('hero_cta', { identifier: userId, value: variant });
  return { variant, cta: COPY[variant] };
}

export function onCtaClick(flagsmith, userId) {
  flagsmith.trackEvent('cta_click', { identifier: userId });
}
