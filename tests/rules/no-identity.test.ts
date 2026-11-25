import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('no-identity', () => {
  fixtureTests('no-identity');

  it('identity in the init options counts', () => {
    const code = "flagsmith.init({ environmentID: 'x', enableEvents: true, identity: visitorId });\nflagsmith.trackEvent('a');";
    expect(issuesFor('no-identity', code)).toEqual([]);
  });

  it('is only "possible" when the client setup is not in the paste', () => {
    expect(issuesFor('no-identity', "flagsmith.trackEvent('a');")[0]?.confidence).toBe('possible');
  });

  it('server-side trackEvent without identifier is "certain"', () => {
    const code = "import Flagsmith from '@flagsmith/nodejs';\nconst flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });\nflagsmith.trackEvent('purchase', { value: 1 });";
    const [issue] = issuesFor('no-identity', code);
    expect(issue?.confidence).toBe('certain');
    expect(issue?.message).toContain('identifier');
  });
});
