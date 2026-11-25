import Flagsmith from '@flagsmith/nodejs';

const flagsmith = new Flagsmith({
  environmentKey: 'ser.abc123',
  enableEvents: true,
});

async function main() {
  const userId = 'user_42';
  const flag = await flagsmith.getExperimentFlag('checkout_button', userId);
  console.log('variant', flag.value);
  flagsmith.trackEvent('purchase', { identifier: userId, value: 10 });
}

void main();
