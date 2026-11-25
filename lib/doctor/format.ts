// Plain-text output of a doctor result, in the two experiment arms' formats. Used by the CLI
// (scripts/doctor.ts) and the agent experiment's doctor tool (scripts/agents/doctor-tool.ts).
// - 'issues' (control): what is wrong + a docs link.
// - 'patch'  (variant): what is wrong + a ready-made fix.

import type { DoctorResult, Issue } from './types';

export type Arm = 'issues' | 'patch';

function location(issue: Issue, describeLine?: (issue: Issue) => string | undefined): string {
  const described = describeLine?.(issue);
  if (described) return described;
  if (issue.line === undefined) return issue.source;
  return `${issue.source} line ${issue.line}`;
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function formatResult(result: DoctorResult, arm: Arm, describeLine?: (issue: Issue) => string | undefined): string {
  const out: string[] = [];
  const certain = result.issues.filter((issue) => issue.confidence === 'certain').length;
  const possible = result.issues.length - certain;
  out.push(`Experiment Doctor ${result.engineVersion}: ${certain} certain issue(s), ${possible} possible issue(s).`);

  result.issues.forEach((issue, index) => {
    out.push('');
    out.push(`${index + 1}. [${issue.confidence}] ${issue.ruleId} (${location(issue, describeLine)})`);
    out.push(`   ${issue.message}`);
    const patch = arm === 'patch' ? issue.patch : undefined;
    if (!patch) {
      out.push(`   Docs: ${issue.docsUrl}`);
    } else if ('command' in patch) {
      out.push('   Fix: run');
      out.push(indent(patch.command, '     '));
    } else {
      out.push('   Fix: replace');
      out.push(indent(patch.before, '   - '));
      out.push('   with');
      out.push(indent(patch.after, '   + '));
    }
  });

  if (result.parseErrors.length > 0) {
    out.push('');
    out.push('Could not parse:');
    for (const error of result.parseErrors) out.push(`- ${error.source} line ${error.line}: ${error.message}`);
  }
  if (result.notChecked.length > 0) {
    out.push('');
    out.push('Not checked (a clean result does not cover these):');
    for (const item of result.notChecked) out.push(`- ${item.ruleId}: ${item.reason}`);
  }
  return out.join('\n');
}
