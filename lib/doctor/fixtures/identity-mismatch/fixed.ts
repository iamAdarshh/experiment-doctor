import Flagsmith from '@flagsmith/nodejs';

const flagsmith = new Flagsmith({
  environmentKey: 'ser.abc123',
  enableEvents: true,
});

type User = { id: string; email: string };

export async function checkout(user: User, total: number) {
  const flag = await flagsmith.getExperimentFlag('checkout_button', user.id);
  flagsmith.trackEvent('purchase', { identifier: user.id, value: total });
  await flagsmith.flushEvents();
  return flag.value;
}
