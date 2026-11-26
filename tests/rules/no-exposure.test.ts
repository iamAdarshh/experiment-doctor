import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../lib/doctor';
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

  describe('flag names kept in constants', () => {
    it('reads a flag name from a top-level const and keeps the constant in the patch', () => {
      const code = `const FLAG_NAME = 'show_demo_button';\n${setup}const value = flagsmith.getValue(FLAG_NAME);\n`;
      const [issue] = issuesFor('no-exposure', code);
      expect(issue?.message).toContain('"show_demo_button"');
      expect(issue?.patch).toEqual({
        before: 'const value = flagsmith.getValue(FLAG_NAME);',
        after: 'const value = flagsmith.getExperimentFlag(FLAG_NAME)?.value;',
      });
      expect(issuesFor('no-exposure', applyPatch(code, issue!.patch!))).toEqual([]);
    });

    it('counts getExperimentFlag(CONSTANT) as an exposure', () => {
      const code = `export const FLAG = 'checkout';\n${setup}flagsmith.getExperimentFlag(FLAG);\nconst dark = flagsmith.hasFeature('dark_mode');`;
      expect(issuesFor('no-exposure', code)).toEqual([]);
    });

    it('does not resolve a name declared twice with different text, or a non-const variable', () => {
      const twice = `// @file a.ts\nconst FLAG = 'one';\n// @file b.ts\nconst FLAG = 'two';\n${setup}flagsmith.getValue(FLAG);`;
      expect(issuesFor('no-exposure', twice)).toEqual([]);
      expect(issuesFor('no-exposure', `let FLAG = 'one';\n${setup}flagsmith.getValue(FLAG);`)).toEqual([]);
    });
  });
});
