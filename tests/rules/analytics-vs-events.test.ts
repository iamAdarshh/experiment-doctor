import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('analytics-vs-events', () => {
  fixtureTests('analytics-vs-events');

  it('eventProcessorConfig without enableEvents is reported even with no event calls (init throws)', () => {
    const code = "flagsmith.init({ environmentID: 'x', eventProcessorConfig: { flushInterval: 5000 } });";
    expect(issuesFor('analytics-vs-events', code)[0]?.message).toContain('throw');
  });

  it('enableAnalytics alone is fine when no experiment calls are made', () => {
    expect(issuesFor('analytics-vs-events', "flagsmith.init({ environmentID: 'x', enableAnalytics: true });")).toEqual([]);
  });

  it('never reported together with events-disabled for the same config', () => {
    const code = "flagsmith.init({ environmentID: 'x', enableAnalytics: true });\nflagsmith.trackEvent('a');";
    expect(issuesFor('analytics-vs-events', code)).toHaveLength(1);
    expect(issuesFor('events-disabled', code)).toEqual([]);
  });
});
