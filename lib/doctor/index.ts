// The doctor engine. runChecks is a pure function: the same input always gives the same result.
// No clock, randomness, network, storage, env, React or Flagsmith here (docs/07-determinism.md;
// eslint.config.mjs enforces the obvious ones).

import { normalizeInput } from './normalize';
import { analyzeCode, type CodeAnalysis, type CodeFacts } from './parse';
import { RULES } from './rules';
import { readFlagJson } from './flag-json';
import { RULE_ORDER, type DoctorInput, type DoctorResult, type InputBox, type Issue, type NotChecked, type ParseError } from './types';
import { ENGINE_VERSION } from './version';

export { ENGINE_VERSION } from './version';
export { RULE_ORDER } from './types';
export type * from './types';
export { applyPatch } from './patch';
export { normalizeInput, splitMetricNames } from './normalize';

const BOX_LABELS: Record<InputBox, string> = {
  code: 'code',
  dependencies: 'a dependency file',
  metricNames: 'metric names',
  flagJson: 'flag JSON (flagsmith feature get <flag> --json)',
};

/** Fixed sort: rule order, then line, then column, then message. Never depends on object or Set order. */
export function compareIssues(a: Issue, b: Issue): number {
  const byRule = RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId);
  if (byRule !== 0) return byRule;
  const byLine = (a.line ?? 0) - (b.line ?? 0);
  if (byLine !== 0) return byLine;
  const byColumn = (a.column ?? 0) - (b.column ?? 0);
  if (byColumn !== 0) return byColumn;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

const NO_CODE: CodeFacts = { calls: [], configs: [], flagReads: [], usesFlagsmith: false, looksLikeServer: false };

export function runChecks(rawInput: DoctorInput): DoctorResult {
  const input = normalizeInput(rawInput);
  const parseErrors: ParseError[] = [];

  const hasCode = input.code.trim() !== '';
  const analysis: CodeAnalysis | null = hasCode ? analyzeCode(input.code) : null;
  if (analysis && !analysis.ok) parseErrors.push(...analysis.parseErrors);
  if (input.flagJson) {
    const reading = readFlagJson(input.flagJson);
    if (!reading.ok && reading.line !== undefined) parseErrors.push({ source: 'flagJson', line: reading.line, message: reading.reason });
    else if (!reading.ok && reading.reason.includes('not valid JSON')) parseErrors.push({ source: 'flagJson', line: 1, message: reading.reason });
  }

  const issues: Issue[] = [];
  const notChecked: NotChecked[] = [];

  for (const ruleId of RULE_ORDER) {
    const rule = RULES[ruleId];
    const missing = rule.needs.find((box) => !isGiven(input, box));
    if (missing) {
      notChecked.push({ ruleId, reason: `Needs ${BOX_LABELS[missing]}.` });
      continue;
    }
    let facts = null;
    if (rule.needs.includes('code')) {
      if (!analysis || !analysis.ok) {
        notChecked.push({ ruleId, reason: analysis && !analysis.ok ? analysis.reason : 'Needs code.' });
        continue;
      }
      if (!analysis.facts.usesFlagsmith) {
        notChecked.push({ ruleId, reason: 'No Flagsmith code was found in the pasted code.' });
        continue;
      }
      facts = analysis.facts;
    }
    // Rules that don't need code still get the parsed code when there is some (sdk-too-old uses it to tell
    // whether the code runs an experiment). With no code or a parse error they get an empty fact list.
    const parsed = analysis && analysis.ok ? analysis.facts : null;
    const outcome = rule.check({
      input,
      code: facts ?? parsed ?? NO_CODE,
      codeParsed: parsed !== null,
    });
    if (Array.isArray(outcome)) issues.push(...outcome);
    else notChecked.push({ ruleId, reason: outcome.notChecked });
  }

  return {
    engineVersion: ENGINE_VERSION,
    issues: issues.sort(compareIssues),
    notChecked,
    parseErrors,
  };
}

function isGiven(input: ReturnType<typeof normalizeInput>, box: InputBox): boolean {
  if (box === 'code') return input.code.trim() !== '';
  if (box === 'dependencies') return input.dependencies !== null;
  if (box === 'metricNames') return input.metricNames !== null;
  return input.flagJson !== null;
}

/** Issues that block a clean result. 'possible' issues are shown but never block (docs/07-determinism.md). */
export function certainIssues(result: DoctorResult): Issue[] {
  return result.issues.filter((issue) => issue.confidence === 'certain');
}
