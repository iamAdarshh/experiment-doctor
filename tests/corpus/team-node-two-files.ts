// @file src/experiment.ts
// Pattern seen in Toggle Wars repos (our own words): names exported from one module, used in another,
// with the Node SDK passing the identity on every call.
export const EXPERIMENT_FLAG = 'checkout_button';
export const CONVERSION_EVENT = 'purchase';

// @file src/checkout.ts
import Flagsmith from '@flagsmith/nodejs';
import { CONVERSION_EVENT, EXPERIMENT_FLAG } from './experiment';

const flagsmith = new Flagsmith({ environmentKey: process.env.FLAGSMITH_SERVER_KEY!, enableEvents: true });

export async function checkout(userId: string, total: number) {
  const flag = await flagsmith.getExperimentFlag(EXPERIMENT_FLAG, userId);
  const discount = flag.value === 'discount' ? 0.1 : 0;
  flagsmith.trackEvent(CONVERSION_EVENT, { identifier: userId, value: total * (1 - discount) });
  await flagsmith.close();
  return discount;
}
