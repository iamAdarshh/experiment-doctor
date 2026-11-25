import { describe, expect, it } from 'vitest';
import { RULE_ORDER, applyPatch, certainIssues, runChecks } from '../../lib/doctor';
import { BABEL_PARSER_VERSION, ENGINE_VERSION } from '../../lib/doctor/version';
import babelPackage from '@babel/parser/package.json';

describe('engine', () => {
  it('ENGINE_VERSION includes the installed parser version', () => {
    expect(BABEL_PARSER_VERSION).toBe(babelPackage.version);
    expect(ENGINE_VERSION).toContain(babelPackage.version);
  });

  it('lists every check as "not checked" when nothing is pasted, never a silent all-clear', () => {
    const result = runChecks({ code: '' });
    expect(result.issues).toEqual([]);
    expect(result.notChecked.map((item) => item.ruleId)).toEqual([...RULE_ORDER]);
  });

  it('reports a parse error with its line and marks code checks "not checked"', () => {
    const result = runChecks({ code: "flagsmith.init({ environmentID: 'x' );\n" });
    expect(result.parseErrors[0]).toMatchObject({ source: 'code', line: 1 });
    expect(result.notChecked.find((item) => item.ruleId === 'events-disabled')?.reason).toMatch(/could not be parsed/);
  });

  it('is honest about other languages', () => {
    const result = runChecks({ code: 'from flagsmith import Flagsmith\nflagsmith = Flagsmith(environment_key="x")\n' });
    expect(result.notChecked.find((item) => item.ruleId === 'events-disabled')?.reason).toMatch(/Python/);
  });

  it('says so when the code has no Flagsmith in it', () => {
    const result = runChecks({ code: 'console.log("hello");' });
    expect(result.notChecked.find((item) => item.ruleId === 'no-flush')?.reason).toMatch(/No Flagsmith code/);
  });

  it('parses several files pasted with // @file markers separately, with lines in the whole box', () => {
    const code = [
      '// @file lib/flagsmith.ts',
      "import flagsmith from '@flagsmith/flagsmith';",
      "export const ready = flagsmith.init({ environmentID: 'x', enableEvents: true });",
      '// @file app/buy.ts',
      "import flagsmith from '@flagsmith/flagsmith';",
      "flagsmith.identify('u');",
      "flagsmith.trackEvent('Purchase');",
    ].join('\n');
    const result = runChecks({ code, metricNames: ['purchase'] });
    expect(result.parseErrors).toEqual([]);
    const mismatch = result.issues.find((issue) => issue.ruleId === 'event-metric-mismatch');
    expect(mismatch?.line).toBe(7);
  });

  it('applying all patches one by one fixes a multi-bug project (agent tier 3 shape)', () => {
    let input = {
      code: [
        "import flagsmith from '@flagsmith/flagsmith';",
        'export async function start(id: string) {',
        '  await flagsmith.init({',
        "    environmentID: 'x',",
        '  });',
        '  await flagsmith.identify(id);',
        "  return flagsmith.getExperimentFlag('banner');",
        '}',
        "export function convert() { flagsmith.trackEvent('Signup'); }",
      ].join('\n'),
      metricNames: ['signup'],
      dependencies: '{ "dependencies": { "@flagsmith/flagsmith": "12.2.0" } }',
    };
    for (let round = 0; round < 10; round += 1) {
      const next = runChecks(input).issues.find((issue) => issue.patch && !('command' in issue.patch));
      if (!next?.patch || 'command' in next.patch) break;
      if (next.source === 'code') input = { ...input, code: applyPatch(input.code, next.patch) };
      if (next.source === 'dependencies') input = { ...input, dependencies: applyPatch(input.dependencies, next.patch) };
    }
    expect(certainIssues(runChecks(input))).toEqual([]);
    expect(runChecks(input).issues).toEqual([]);
  });

  it('applyPatch refuses a patch that does not match', () => {
    expect(() => applyPatch('abc', { before: 'zzz', after: 'y' })).toThrow(/not found/);
  });
});
