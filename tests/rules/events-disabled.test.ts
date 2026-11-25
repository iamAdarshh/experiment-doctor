import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../lib/doctor';
import { fixtureTests, issuesFor, notCheckedReason } from '../helpers/rule-suite';

describe('events-disabled', () => {
  fixtureTests('events-disabled');

  it('flips enableEvents: false to true', () => {
    const code = "flagsmith.init({ environmentID: 'x', enableEvents: false });\nflagsmith.identify('u');\nflagsmith.trackEvent('purchase');";
    const [issue] = issuesFor('events-disabled', code);
    expect(issue?.message).toContain('set to false');
    expect(applyPatch(code, issue!.patch!)).toContain('enableEvents: true');
  });

  it('adds the option on a one-line object', () => {
    const code = "flagsmith.init({ environmentID: 'x' });\nflagsmith.getExperimentFlag('f');";
    const [issue] = issuesFor('events-disabled', code);
    expect(applyPatch(code, issue!.patch!)).toContain("flagsmith.init({ environmentID: 'x', enableEvents: true });");
  });

  it('reads React FlagsmithProvider options', () => {
    const code = [
      "import { FlagsmithProvider, useExperiment } from '@flagsmith/flagsmith/react';",
      "export const App = () => <FlagsmithProvider flagsmith={flagsmith} options={{ environmentID: 'x' }}><Page /></FlagsmithProvider>;",
      "function Page() { const flag = useExperiment('f'); return <p>{String(flag?.value)}</p>; }",
    ].join('\n');
    expect(issuesFor('events-disabled', code)).toHaveLength(1);
  });

  it('resolves options passed as a variable', () => {
    const code = "const options = { environmentID: 'x', enableEvents: true };\nflagsmith.init(options);\nflagsmith.trackEvent('a');";
    expect(issuesFor('events-disabled', code)).toEqual([]);
  });

  it('says "not checked" when the options are a spread it cannot read', () => {
    const code = "flagsmith.init({ ...shared });\nflagsmith.trackEvent('a');";
    expect(issuesFor('events-disabled', code)).toEqual([]);
    expect(notCheckedReason('events-disabled', code)).toMatch(/could not read/);
  });

  it('says "not checked" when no init is pasted', () => {
    expect(notCheckedReason('events-disabled', "flagsmith.trackEvent('a');")).toMatch(/no Flagsmith init/);
  });

  it('ignores trackEvent on other libraries', () => {
    const code = "analytics.trackEvent('a');\nflagsmith.init({ environmentID: 'x' });";
    expect(issuesFor('events-disabled', code)).toEqual([]);
  });
});
