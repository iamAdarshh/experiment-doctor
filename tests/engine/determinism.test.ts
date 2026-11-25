// Same input -> same output, byte for byte (docs/07-determinism.md, test 3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RULE_ORDER, runChecks, type DoctorInput } from '../../lib/doctor';
import { loadFixture } from '../helpers/fixtures';

const fixtures = RULE_ORDER.map((ruleId) => loadFixture(ruleId));
const inputs: DoctorInput[] = fixtures.flatMap((fixture) => [fixture.broken, fixture.fixed]);

function toCrlf(text: string | undefined) {
  return text === undefined ? undefined : text.replace(/\n/g, '\r\n');
}

/** Rule id, confidence and line of every issue: what must not change when only layout changes. */
function shape(input: DoctorInput, lineShift = 0) {
  return runChecks(input).issues.map((issue) => `${issue.ruleId}|${issue.confidence}|${(issue.line ?? 0) - lineShift}`);
}

describe('determinism', () => {
  it('running twice gives identical JSON', () => {
    for (const input of inputs) {
      expect(JSON.stringify(runChecks(input))).toBe(JSON.stringify(runChecks(input)));
    }
  });

  it('box order, CRLF line endings, a BOM and trailing spaces change nothing', () => {
    for (const input of inputs) {
      const reordered: DoctorInput = {
        flagJson: toCrlf(input.flagJson),
        metricNames: input.metricNames?.map((name) => `  ${name} `),
        dependencies: toCrlf(input.dependencies),
        code: `﻿${input.code.replace(/\n/g, '   \r\n')}`,
      };
      for (const key of Object.keys(reordered) as (keyof DoctorInput)[]) {
        if (reordered[key] === undefined) delete reordered[key];
      }
      expect(runChecks(reordered)).toEqual(runChecks(input));
    }
  });

  it('property: comments appended at the end never change the issues', () => {
    fc.assert(
      fc.property(fc.constantFrom(...inputs), fc.string().filter((text) => !/[\r\n\u2028\u2029]/.test(text)), (input, comment) => {
        if (input.code.trim() === '') return;
        const withComment = { ...input, code: `${input.code}\n// ${comment}\n` };
        expect(shape(withComment)).toEqual(shape(input));
      }),
      { numRuns: 200 },
    );
  });

  it('property: blank lines and unrelated code at the top only shift line numbers', () => {
    // Unique lines: declaring `helper` twice would be a real syntax error, and then everything is "not checked".
    const unrelated = fc.constantFrom('', 'const answer = 42;', 'function helper() { return 1; }', '// a comment', 'type Id = string;');
    fc.assert(
      fc.property(fc.constantFrom(...inputs), fc.uniqueArray(unrelated, { maxLength: 5 }), (input, lines) => {
        if (input.code.trim() === '' || lines.length === 0) return;
        const shifted = { ...input, code: `${lines.join('\n')}\n${input.code}` };
        const codeShape = (value: DoctorInput, shift: number) =>
          shape(value, shift).filter((entry) => !entry.startsWith('sdk-too-old') && !entry.startsWith('variation-key'));
        expect(codeShape(shifted, lines.length)).toEqual(codeShape(input, 0));
      }),
      { numRuns: 200 },
    );
  });

  it('property: never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), fc.option(fc.string(), { nil: undefined }), fc.option(fc.string(), { nil: undefined }), (code, dependencies, flagJson) => {
        expect(() => runChecks({ code, dependencies, flagJson, metricNames: ['a'] })).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
