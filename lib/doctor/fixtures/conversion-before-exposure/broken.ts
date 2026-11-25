import flagsmith from '@flagsmith/flagsmith';

export async function checkout(visitorId: string, total: number) {
  await flagsmith.init({
    environmentID: 'env_abc123',
    enableEvents: true,
  });
  await flagsmith.identify(visitorId);
  flagsmith.trackEvent('purchase', { value: total });
  const flag = flagsmith.getExperimentFlag('checkout_button');
  await flagsmith.flushEvents();
  return flag;
}
