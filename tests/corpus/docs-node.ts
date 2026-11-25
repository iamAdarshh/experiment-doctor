// Node SDK (@flagsmith/nodejs >= 9.1.0): identity passed per call, close() before exit.
import Flagsmith from '@flagsmith/nodejs';

const flagsmith = new Flagsmith({
  environmentKey: process.env.FLAGSMITH_SERVER_KEY!,
  enableEvents: true,
});

async function main() {
  const userId = 'user_42';
  const flag = await flagsmith.getExperimentFlag('checkout_button', userId);
  console.log(flag.value);
  flagsmith.trackEvent('purchase', { identifier: userId, value: 10 });
  await flagsmith.close();
}

void main();
