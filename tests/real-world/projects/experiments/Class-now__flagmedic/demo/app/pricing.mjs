// Demo app: the pricing page of a tiny SaaS ("Acme Deploy").
// The experiment wiring below is what Flagsmith's official setup prompt adds to an app:
// identify the user, read the experiment flag where the variation is shown, track the conversion.
import { Flagsmith } from '@flagsmith/nodejs';

export function createClient() {
  return new Flagsmith({
    environmentKey: process.env.FLAGSMITH_SERVER_KEY,
    enableEvents: true,
  });
}

const COPY = {
  control: 'Get started',
  bold: 'Start building free',
};

// Renders the pricing page CTA for one visitor and records the exposure.
export async function renderPricing(flagsmith, userId) {
  const flag = await flagsmith.getExperimentFlag('plan_cta', userId);
  const variant = flag.value === 'bold' ? 'bold' : 'control';
  return { variant, cta: COPY[variant] };
}

// Called when the visitor clicks the CTA.
export function onCtaClick(flagsmith, userId) {
  flagsmith.trackEvent('cta_click', { identifier: userId });
}
