import { describe, expect, it } from 'vitest';
import { runChecks } from '../../lib/doctor';
import { fixtureTests } from '../helpers/rule-suite';

function check(flagJson: string) {
  return runChecks({ code: '', flagJson });
}

describe('variation-key', () => {
  fixtureTests('variation-key');

  it('flags a variation keyed "control"', () => {
    const result = check(JSON.stringify({ name: 'f', multivariate_options: [{ key: 'control', string_value: 'b' }] }));
    expect(result.issues[0]?.message).toContain('reserved');
  });

  it('flags a flag with no variations', () => {
    const result = check(JSON.stringify({ name: 'f', multivariate_options: [] }));
    expect(result.issues[0]?.message).toContain('no variations');
  });

  it('reports invalid JSON as a parse error and "not checked"', () => {
    const result = check('{ not json');
    expect(result.parseErrors[0]?.source).toBe('flagJson');
    expect(result.notChecked.some((item) => item.ruleId === 'variation-key')).toBe(true);
  });

  it('quotes values with spaces in the command', () => {
    const result = check(JSON.stringify({ name: 'f', multivariate_options: [{ string_value: 'Big Green' }] }));
    const patch = result.issues[0]?.patch;
    expect(patch && 'command' in patch ? patch.command : '').toContain("--value 'Big Green' --key big_green");
  });
});
