import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('conversion-before-exposure', () => {
  fixtureTests('conversion-before-exposure');

  it('only compares calls inside the same function', () => {
    const code = [
      "flagsmith.init({ environmentID: 'x', enableEvents: true });",
      "function onBuy() { flagsmith.trackEvent('purchase'); }",
      "function show() { return flagsmith.getExperimentFlag('f'); }",
    ].join('\n');
    expect(issuesFor('conversion-before-exposure', code)).toEqual([]);
  });
});
