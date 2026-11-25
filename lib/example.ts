// The "Load a broken example" content: three real bugs (no enableEvents, an event-name typo, an old SDK).
export const BROKEN_EXAMPLE = {
  code: `import flagsmith from '@flagsmith/flagsmith';

export async function startCheckoutTest(visitorId: string) {
  await flagsmith.init({
    environmentID: 'YOUR_ENVIRONMENT_ID',
    enableAnalytics: true,
  });
  await flagsmith.identify(visitorId);
  return flagsmith.getExperimentFlag('checkout_button');
}

export function onPurchase(total: number) {
  flagsmith.trackEvent('Purchase', { value: total });
}
`,
  dependencies: `{
  "dependencies": {
    "@flagsmith/flagsmith": "12.2.0"
  }
}
`,
  metricNames: 'purchase',
  flagJson: '',
};
