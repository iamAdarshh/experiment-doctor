import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('identity-mismatch', () => {
  fixtureTests('identity-mismatch');

  it('compares identify() with trackEvent identifier, ignoring whitespace', () => {
    const same = "flagsmith.init({ environmentID: 'x', enableEvents: true });\nflagsmith.identify(user.id);\nflagsmith.trackEvent('a', { identifier: user . id });";
    expect(issuesFor('identity-mismatch', same)).toEqual([]);
  });

  const server = "import Flagsmith from '@flagsmith/nodejs';\nconst flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });\n";

  it('does not compare identities across functions (the same value often has another name there)', () => {
    const code = `${server}export async function show(userId: string) { await flagsmith.getExperimentFlag('f', userId); }\nexport function buy(id: string) { flagsmith.trackEvent('purchase', { identifier: id }); }`;
    expect(issuesFor('identity-mismatch', code)).toEqual([]);
  });

  it('does not compare the top level of two different pasted files', () => {
    const code = `// @file a.ts\n${server}await flagsmith.getExperimentFlag('f', visitorId);\n// @file b.ts\n${server}flagsmith.trackEvent('purchase', { identifier: probeId });`;
    expect(issuesFor('identity-mismatch', code)).toEqual([]);
  });

  it('does not compare two exposures with each other', () => {
    const code = `${server}async function probe() {\n  await flagsmith.getExperimentFlag('f', 'probe-1');\n  await flagsmith.getExperimentFlag('f', 'probe-2');\n}`;
    expect(issuesFor('identity-mismatch', code)).toEqual([]);
  });
});
