import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('identity-mismatch', () => {
  fixtureTests('identity-mismatch');

  it('compares identify() with trackEvent identifier, ignoring whitespace', () => {
    const same = "flagsmith.init({ environmentID: 'x', enableEvents: true });\nflagsmith.identify(user.id);\nflagsmith.trackEvent('a', { identifier: user . id });";
    expect(issuesFor('identity-mismatch', same)).toEqual([]);
  });
});
