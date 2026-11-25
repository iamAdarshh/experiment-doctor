import flagsmith from '@flagsmith/flagsmith';

export async function checkout(visitorId: string, total: number) {
  await flagsmith.init({
    environmentID: 'env_abc123',
    enableEvents: true,
  });
  await flagsmith.identify(visitorId);
  const flag = flagsmith.getExperimentFlag('checkout_button');
  flagsmith.trackEvent('purchase', { value: total });
  await flagsmith.flushEvents();
  return flag;
}
