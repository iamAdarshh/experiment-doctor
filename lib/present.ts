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

export type FixedCode = {
  /** The code box with every code fix that could be applied. */
  text: string;
  /** How many code fixes were applied. */
  applied: number;
  /** Code fixes left out because they touch the same lines as another fix (copy those from their own card). */
  skipped: number;
  /** Fixes for other boxes (dependency file, commands): not part of the code, so copied from their own card. */
  elsewhere: number;
};

/**
 * The variant's "Copy all fixed code": applies every code fix to the scanned code at once.
 *
 * Each fix's `before` is unique in the code (lib/doctor/patch.ts grows it until it is), so we find where each
 * one sits in the ORIGINAL code, then replace from the bottom up: a replacement lower down never moves the
 * text above it, so the positions found first stay correct. Two fixes on overlapping lines can't both apply;
 * the upper one is kept and the other is counted as skipped, never silently merged.
 */
export function applyCodeFixes(code: string, issues: Issue[]): FixedCode {
  const elsewhere = issues.filter((issue) => issue.patch && (issue.source !== 'code' || 'command' in issue.patch)).length;

  const edits: { start: number; end: number; after: string }[] = [];
  let skipped = 0;
  for (const issue of issues) {
    const patch = issue.patch;
    if (!patch || issue.source !== 'code' || 'command' in patch) continue;
    const start = code.indexOf(patch.before);
    if (start === -1) {
      skipped += 1;
      continue;
    }
    edits.push({ start, end: start + patch.before.length, after: patch.after });
  }

  // Top to bottom, keep an edit only if it starts after the previous kept one ends.
  edits.sort((a, b) => a.start - b.start);
  const kept: typeof edits = [];
  for (const edit of edits) {
    const previous = kept[kept.length - 1];
    if (previous && edit.start < previous.end) skipped += 1;
    else kept.push(edit);
  }

  let text = code;
  for (const edit of [...kept].reverse()) {
    text = text.slice(0, edit.start) + edit.after + text.slice(edit.end);
  }
  return { text, applied: kept.length, skipped, elsewhere };
}
