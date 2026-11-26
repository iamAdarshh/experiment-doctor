// How a DoctorResult is presented on the page: the headline, the issue order and where each issue is.
// Pure functions so the wording rules are unit-tested (tests/present.test.ts). Used identically by both arms.

import type { DoctorResult, Issue } from '@/lib/doctor';

export type Summary =
  /** The code box was not checked at all (empty, another language, or no Flagsmith code). */
  | { kind: 'nothing-checked'; reason: string }
  | { kind: 'issues'; certain: number; possible: number }
  /** No certain issues, but some possible ones. */
  | { kind: 'possible-only'; possible: number }
  /** No issues at all. `notChecked` > 0 means some checks were skipped, so this is not a full all-clear. */
  | { kind: 'clean'; notChecked: number };

export function summarize(result: DoctorResult): Summary {
  const certain = result.issues.filter((issue) => issue.confidence === 'certain').length;
  const possible = result.issues.length - certain;
  if (certain > 0) return { kind: 'issues', certain, possible };
  if (possible > 0) return { kind: 'possible-only', possible };

  // events-disabled needs only the code box, so when it was skipped the code itself was not checked.
  const codeSkipped = result.notChecked.find((item) => item.ruleId === 'events-disabled');
  if (codeSkipped) return { kind: 'nothing-checked', reason: codeSkipped.reason };
  return { kind: 'clean', notChecked: result.notChecked.length };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function headline(summary: Summary): string {
  switch (summary.kind) {
    case 'nothing-checked':
      return 'Nothing was checked';
    case 'issues': {
      const main = `${plural(summary.certain, 'issue')} will lose experiment events`;
      return summary.possible > 0 ? `${main}, ${summary.possible} more might` : main;
    }
    case 'possible-only':
      return `No blocking issues, but ${summary.possible} might lose events`;
    case 'clean':
      return summary.notChecked > 0 ? 'No blocking issues in what was checked' : 'No blocking issues found';
  }
}

/** Certain issues first, then possible ones. Within each group the engine's order is kept (stable sort). */
export function orderForDisplay(issues: Issue[]): Issue[] {
  const rank = (issue: Issue) => (issue.confidence === 'certain' ? 0 : 1);
  return [...issues].sort((a, b) => rank(a) - rank(b));
}

const SOURCE_LABELS: Record<Issue['source'], string> = {
  code: 'code',
  dependencies: 'dependency file',
  metricNames: 'metric names',
  flagJson: 'flag JSON',
};

const FILE_MARKER = /^\/\/ @file (.+)$/;

/**
 * Where an issue is, in the visitor's own terms. When several files were pasted with `// @file path` markers, a
 * code line is shown as "path line N" (the marker line itself is line 0 of that file), so it matches their editor.
 */
export function describeLocation(code: string, issue: Issue): string {
  const label = SOURCE_LABELS[issue.source];
  if (issue.line === undefined) return label;
  if (issue.source !== 'code') return `${label} line ${issue.line}`;

  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  for (let index = Math.min(issue.line, lines.length) - 1; index >= 0; index -= 1) {
    const marker = FILE_MARKER.exec(lines[index]!.trimEnd());
    if (marker) return `${marker[1]!.trim()} line ${issue.line - (index + 1)}`;
  }
  return `code line ${issue.line}`;
}
