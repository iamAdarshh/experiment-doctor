import { describe, expect, it } from 'vitest';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

const setup = "flagsmith.init({ environmentID: 'x', enableEvents: true });\nflagsmith.identify('u');\nflagsmith.trackEvent('purchase');\n";

describe('no-exposure', () => {
  fixtureTests('no-exposure');

  it('catches getAllFlags().flag reads', () => {
    expect(issuesFor('no-exposure', `${setup}const v = flagsmith.getAllFlags().checkout_button;`)).toHaveLength(1);
  });

  it('stays quiet when another flag already records exposures (probably an ordinary flag)', () => {
    const code = `${setup}flagsmith.getExperimentFlag('checkout');\nconst dark = flagsmith.hasFeature('dark_mode');`;
    expect(issuesFor('no-exposure', code)).toEqual([]);
  });

  it('uses the flag JSON to know which flag is the experiment flag', () => {
    const code = `${setup}flagsmith.getExperimentFlag('other');\nconst v = flagsmith.getValue('checkout');`;
    expect(issuesFor('no-exposure', code, { flagJson: JSON.stringify({ name: 'checkout', multivariate_options: [{ key: 'b' }] }) })).toHaveLength(1);
  });

  it('stays quiet without conversions', () => {
    expect(issuesFor('no-exposure', "flagsmith.init({ environmentID: 'x' });\nflagsmith.getValue('f');")).toEqual([]);
  });
});
