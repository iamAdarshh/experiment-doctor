// Demo app, broken on purpose (scenario 1): the new "bold" CTA came with its own button component,
// and that component reports the click under a different event name than the metric counts.
import { Flagsmith } from '@flagsmith/nodejs';

export function createClient() {
  return new Flagsmith({
    environmentKey: process.env.FLAGSMITH_SERVER_KEY,
    enableEvents: true,
  });
}

const COPY = {
  control: 'Start your trial',
  bold: 'Try it free for 14 days',
};

export async function renderPricing(flagsmith, userId) {
  const flag = await flagsmith.getExperimentFlag('trial_cta', userId);
  const variant = flag.value === 'bold' ? 'bold' : 'control';
  return { variant, cta: COPY[variant] };
}

export function onCtaClick(flagsmith, userId, variant) {
  if (variant === 'bold') {
    // BoldTrialButton: added together with the new copy
    flagsmith.trackEvent('ctaClick', { identifier: userId });
  } else {
    flagsmith.trackEvent('cta_click', { identifier: userId });
  }
}
