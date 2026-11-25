// Adapted from the JS SDK snippet on https://docs.flagsmith.com/experimentation/run-an-experiment
import flagsmith from '@flagsmith/flagsmith';

await flagsmith.init({
  environmentID: process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID!,
  enableEvents: true,
});
await flagsmith.identify('user_42');

// Exposure + value in one call
const flag = flagsmith.getExperimentFlag('checkout_button');

// Deferred exposure alternative
const f = flagsmith.getAllFlags().checkout_button;
if (f?.experiment?.inExperiment) flagsmith.trackExposureEvent('checkout_button', { value: f.variant });

// Conversion
flagsmith.trackEvent('purchase', { value: 99.5 });

await flagsmith.flushEvents();
export { flag };
