import { describe, expect, it } from 'vitest';
import { runChecks, type DoctorResult, type Issue } from '@/lib/doctor';
import { BROKEN_EXAMPLE } from '@/lib/example';
import { applyCodeFixes, describeLocation, headline, orderForDisplay, summarize } from '@/lib/present';

function issue(confidence: Issue['confidence'], ruleId: Issue['ruleId'], line?: number): Issue {
  return { ruleId, confidence, source: 'code', line, message: '', docsUrl: '' };
}

function result(issues: Issue[], notChecked: DoctorResult['notChecked'] = []): DoctorResult {
  return { engineVersion: 'test', issues, notChecked, parseErrors: [] };
}

describe('summarize and headline', () => {
  it('counts certain and possible issues', () => {
    const summary = summarize(result([issue('certain', 'no-flush'), issue('possible', 'no-exposure'), issue('certain', 'no-identity')]));
    expect(summary).toEqual({ kind: 'issues', certain: 2, possible: 1 });
    expect(headline(summary)).toBe('2 issues will lose experiment events, 1 more might');
  });

  it('uses the singular for one issue', () => {
    expect(headline(summarize(result([issue('certain', 'no-flush')])))).toBe('1 issue will lose experiment events');
  });

  it('does not call possible-only results clean', () => {
    expect(headline(summarize(result([issue('possible', 'no-exposure')])))).toBe('No blocking issues, but 1 might lose events');
  });

  it('never shows an all-clear when the code was not checked', () => {
    const empty = runChecks({ code: '' });
    expect(summarize(empty).kind).toBe('nothing-checked');
    expect(headline(summarize(empty))).toBe('Nothing was checked');
    expect(summarize(runChecks({ code: 'const a = 1;\n' })).kind).toBe('nothing-checked');
  });

  it('marks a clean result with skipped checks as partial', () => {
    const summary = summarize(result([], [{ ruleId: 'sdk-too-old', reason: 'Needs a dependency file.' }]));
    expect(summary).toEqual({ kind: 'clean', notChecked: 1 });
    expect(headline(summary)).toBe('No blocking issues in what was checked');
    expect(headline(summarize(result([])))).toBe('No blocking issues found');
  });

  it('summarizes the broken example as blocking', () => {
    expect(summarize(runChecks({ ...BROKEN_EXAMPLE, metricNames: [BROKEN_EXAMPLE.metricNames] })).kind).toBe('issues');
  });
});

describe('orderForDisplay', () => {
  it('puts certain issues first and keeps the engine order within each group', () => {
    const issues = [issue('certain', 'event-metric-mismatch', 13), issue('possible', 'no-flush', 9), issue('certain', 'sdk-too-old', 3), issue('certain', 'analytics-vs-events', 4)];
    expect(orderForDisplay(issues).map((item) => item.ruleId)).toEqual(['event-metric-mismatch', 'sdk-too-old', 'analytics-vs-events', 'no-flush']);
    expect(issues[1]!.ruleId).toBe('no-flush'); // input not mutated
  });
});

describe('describeLocation', () => {
  it('uses the box name for single-file code and other boxes', () => {
    expect(describeLocation('a\nb\n', issue('certain', 'no-flush', 2))).toBe('code line 2');
    expect(describeLocation('', { ...issue('certain', 'sdk-too-old', 3), source: 'dependencies' })).toBe('dependency file line 3');
    expect(describeLocation('', { ...issue('certain', 'variation-key'), source: 'flagJson' })).toBe('flag JSON');
  });

  it('maps lines inside // @file sections to the file and its own line number', () => {
    const code = '// @file src/a.ts\nconst a = 1;\nconst b = 2;\n// @file src/b.ts\nconst c = 3;\n';
    expect(describeLocation(code, issue('certain', 'no-flush', 3))).toBe('src/a.ts line 2');
    expect(describeLocation(code, issue('certain', 'no-flush', 5))).toBe('src/b.ts line 1');
  });
});

describe('applyCodeFixes', () => {
  const exampleInput = { ...BROKEN_EXAMPLE, metricNames: [BROKEN_EXAMPLE.metricNames] };

  it('applies every code fix to the broken example, and the re-scan no longer finds those issues', () => {
    const before = runChecks(exampleInput);
    const fixed = applyCodeFixes(exampleInput.code, before.issues);
    expect(fixed).toMatchObject({ applied: 3, skipped: 0, elsewhere: 1 }); // the old SDK is in the dependency file

    const after = runChecks({ ...exampleInput, code: fixed.text });
    const codeRulesBefore = before.issues.filter((item) => item.source === 'code').map((item) => item.ruleId);
    const stillFiring = after.issues.filter((item) => codeRulesBefore.includes(item.ruleId));
    expect(stillFiring).toEqual([]);
  });

  it('is the same as applying the fixes one by one when they do not overlap', () => {
    const code = 'a\nb\nc\nd\n';
    const issues = [
      { ...issue('certain', 'no-flush'), patch: { before: 'd', after: 'D' } },
      { ...issue('certain', 'no-identity'), patch: { before: 'b', after: 'B1\nB2' } },
    ];
    expect(applyCodeFixes(code, issues)).toEqual({ text: 'a\nB1\nB2\nc\nD\n', applied: 2, skipped: 0, elsewhere: 0 });
  });

  it('skips a fix that overlaps another instead of merging them', () => {
    const issues = [
      { ...issue('certain', 'no-flush'), patch: { before: 'b\nc', after: 'BC' } },
      { ...issue('certain', 'no-identity'), patch: { before: 'c\nd', after: 'CD' } },
    ];
    expect(applyCodeFixes('a\nb\nc\nd', issues)).toEqual({ text: 'a\nBC\nd', applied: 1, skipped: 1, elsewhere: 0 });
  });

  it('leaves out command fixes and fixes for other boxes', () => {
    const issues = [
      { ...issue('certain', 'sdk-too-old'), source: 'dependencies' as const, patch: { before: 'x', after: 'y' } },
      { ...issue('certain', 'sdk-too-old'), patch: { command: 'npm i @flagsmith/flagsmith@12.4.0' } },
    ];
    expect(applyCodeFixes('x', issues)).toEqual({ text: 'x', applied: 0, skipped: 0, elsewhere: 2 });
  });
});
