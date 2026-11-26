import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../lib/doctor';
import { fixtureTests, issuesFor, notCheckedReason } from '../helpers/rule-suite';

const code = "flagsmith.init({ environmentID: 'x', enableEvents: true });\nflagsmith.trackEvent('rescan_clen');";

describe('event-metric-mismatch', () => {
  fixtureTests('event-metric-mismatch');

  it('suggests the closest metric name', () => {
    const [issue] = issuesFor('event-metric-mismatch', code, { metricNames: ['rescan_count', 'rescan_clean'] });
    expect(issue?.message).toContain('did you mean "rescan_clean"');
  });

  it('is case-sensitive', () => {
    const upper = "flagsmith.trackEvent('Rescan_Clean');";
    expect(issuesFor('event-metric-mismatch', upper, { metricNames: ['rescan_clean'] })).toHaveLength(1);
  });

  it('is "not checked" without metric names', () => {
    expect(notCheckedReason('event-metric-mismatch', code)).toMatch(/metric names/);
  });

  it('skips event names it cannot read', () => {
    expect(issuesFor('event-metric-mismatch', 'flagsmith.trackEvent(eventName);', { metricNames: ['a'] })).toEqual([]);
  });

  it('reads an event name from a top-level const and patches the constant', () => {
    const withConst = "const CONVERSION_EVENT = 'Purchase';\nflagsmith.init({ environmentID: 'x', enableEvents: true });\nflagsmith.trackEvent(CONVERSION_EVENT);";
    const [issue] = issuesFor('event-metric-mismatch', withConst, { metricNames: ['purchase'] });
    expect(issue).toMatchObject({ line: 1, patch: { before: "const CONVERSION_EVENT = 'Purchase';", after: "const CONVERSION_EVENT = 'purchase';" } });
    expect(issuesFor('event-metric-mismatch', applyPatch(withConst, issue!.patch!), { metricNames: ['purchase'] })).toEqual([]);
  });
});
