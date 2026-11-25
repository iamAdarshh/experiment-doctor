// The three checks every rule must pass (docs/07-determinism.md, "Reliability tests"):
// broken fires (exactly as expected.json), fixed is silent, and each text patch makes the rule stop firing.
import { expect, it } from 'vitest';
import { applyPatch, runChecks, type RuleId } from '../../lib/doctor';
import { boxText, loadFixture, withBoxText } from './fixtures';

export function fixtureTests(ruleId: RuleId) {
  const fixture = loadFixture(ruleId);

  it('broken fixture gives exactly the issues in expected.json', () => {
    expect(runChecks(fixture.broken).issues).toEqual(fixture.expected);
    expect(fixture.expected.some((issue) => issue.ruleId === ruleId)).toBe(true);
  });

  it('fixed fixture has no issues at all', () => {
    expect(runChecks(fixture.fixed).issues).toEqual([]);
  });

  it('patch round-trip: applying each patch stops the rule firing at that place', () => {
    const ownIssues = runChecks(fixture.broken).issues.filter((issue) => issue.ruleId === ruleId);
    for (const issue of ownIssues) {
      if (!issue.patch || 'command' in issue.patch) continue; // command patches change Flagsmith, not text
      const patchedText = applyPatch(boxText(fixture.broken, issue.source), issue.patch);
      const patched = withBoxText(fixture.broken, issue.source, patchedText);
      const after = runChecks(patched).issues.filter((other) => other.ruleId === ruleId);
      expect(after).toHaveLength(ownIssues.length - 1);
      expect(after.some((other) => other.message === issue.message)).toBe(false);
    }
  });
}

/** Run the doctor on code only (plus optional extra boxes) and keep one rule's issues. */
export function issuesFor(ruleId: RuleId, code: string, extra: { metricNames?: string[]; dependencies?: string; flagJson?: string } = {}) {
  return runChecks({ code, ...extra }).issues.filter((issue) => issue.ruleId === ruleId);
}

export function notCheckedReason(ruleId: RuleId, code: string, extra: { metricNames?: string[]; dependencies?: string; flagJson?: string } = {}) {
  return runChecks({ code, ...extra }).notChecked.find((item) => item.ruleId === ruleId)?.reason;
}
