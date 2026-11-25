import flagsmith from '@flagsmith/flagsmith';

export async function startExperiment(visitorId: string) {
  await flagsmith.init({
    environmentID: 'env_abc123',
    enableEvents: true,
  });
  await flagsmith.identify(visitorId);
  window.addEventListener('pagehide', () => {
    void flagsmith.flushEvents();
  });
  return flagsmith.getValue('checkout_button');
}

export function onPurchase(total: number) {
  flagsmith.trackEvent('purchase', { value: total });
}
