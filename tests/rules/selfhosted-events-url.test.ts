import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../lib/doctor';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('selfhosted-events-url', () => {
  fixtureTests('selfhosted-events-url');

  it('a self-hosted api without eventsApiUrl gets one added', () => {
    const code = [
      'flagsmith.init({',
      "  environmentID: 'x',",
      "  api: 'https://flags.example.org/api/v1/',",
      '  enableEvents: true,',
      '});',
      "flagsmith.identify('u');",
      "flagsmith.trackEvent('purchase');",
    ].join('\n');
    const [issue] = issuesFor('selfhosted-events-url', code);
    const patched = applyPatch(code, issue!.patch!);
    expect(patched).toContain("eventProcessorConfig: { eventsApiUrl: 'https://flags.example.org/api/' },");
    expect(issuesFor('selfhosted-events-url', patched)).toEqual([]);
  });

  it('the Flagsmith Cloud API is not self-hosted', () => {
    const code = "flagsmith.init({ environmentID: 'x', api: 'https://edge.api.flagsmith.com/api/v1/', enableEvents: true });\nflagsmith.trackEvent('a');";
    expect(issuesFor('selfhosted-events-url', code)).toEqual([]);
  });
});
