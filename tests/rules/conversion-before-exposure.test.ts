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

  it('does not compare the top level of two different pasted files', () => {
    const server = "import Flagsmith from '@flagsmith/nodejs';\nconst flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });\n";
    const code = `// @file scripts/ping.ts\n${server}flagsmith.trackEvent('purchase', { identifier: 'ping' });\nawait flagsmith.close();\n// @file scripts/run.ts\n${server}await flagsmith.getExperimentFlag('f', 'u');\nawait flagsmith.close();`;
    expect(issuesFor('conversion-before-exposure', code)).toEqual([]);
  });
});
