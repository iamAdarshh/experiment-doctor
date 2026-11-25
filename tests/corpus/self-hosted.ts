// Self-hosted Flagsmith in Flagsmith DB mode: events URL is the API URL ending in /api/.
import flagsmith from '@flagsmith/flagsmith';

export async function start(visitorId: string) {
  await flagsmith.init({
    environmentID: 'env_abc123',
    api: 'https://flagsmith.example.com/api/v1/',
    enableEvents: true,
    eventProcessorConfig: { eventsApiUrl: 'https://flagsmith.example.com/api/' },
  });
  await flagsmith.identify(visitorId);
  window.addEventListener('pagehide', () => {
    void flagsmith.flushEvents();
  });
  return flagsmith.getExperimentFlag('checkout_button');
}
