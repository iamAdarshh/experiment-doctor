// Building and applying text patches. A patch is { before, after }: replace the first occurrence of
// `before` with `after`. `before` is always made of whole lines and grown until it is unique in the box,
// so a person can find it by eye and the replacement lands in the right place.

import type { Patch } from './types';

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf('\n', index);
  return end === -1 ? text.length : end;
}

function countOccurrences(text: string, part: string): number {
  if (part === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const found = text.indexOf(part, from);
    if (found === -1) return count;
    count += 1;
    from = found + 1;
  }
}

/** Leading spaces/tabs of the line that contains `index`. */
export function indentAt(text: string, index: number): string {
  const start = lineStart(text, index);
  const match = /^[ \t]*/.exec(text.slice(start));
  return match ? match[0] : '';
}

/** Whole lines covering [start, end), grown one line at a time (down, then up) until the text is unique. */
function uniqueLines(text: string, start: number, end: number): { from: number; to: number } {
  let from = lineStart(text, start);
  let to = lineEnd(text, Math.max(end - 1, start));
  let growDown = true;
  while (countOccurrences(text, text.slice(from, to)) > 1) {
    if (growDown && to < text.length) to = lineEnd(text, to + 1);
    else if (from > 0) from = lineStart(text, from - 1);
    else if (to < text.length) to = lineEnd(text, to + 1);
    else break;
    growDown = !growDown;
  }
  return { from, to };
}

/** Replace text[start, end) with `replacement`. */
export function replaceRangePatch(text: string, start: number, end: number, replacement: string): Patch {
  const { from, to } = uniqueLines(text, start, end);
  const before = text.slice(from, to);
  const after = text.slice(from, start) + replacement + text.slice(end, to);
  return { before, after };
}

/** Insert `newLine` as a new line after the line that contains `index`. */
export function insertLineAfterPatch(text: string, index: number, newLine: string): Patch {
  const targetEnd = lineEnd(text, index);
  const { from, to } = uniqueLines(text, index, targetEnd);
  const before = text.slice(from, to);
  // The snippet may have grown past the target line to stay unique; insert right after the target line.
  const offset = targetEnd - from;
  return { before, after: `${before.slice(0, offset)}\n${newLine}${before.slice(offset)}` };
}

/** Insert `newLine` as a new line before the line that contains `index`. */
export function insertLineBeforePatch(text: string, index: number, newLine: string): Patch {
  const start = lineStart(text, index);
  const { from, to } = uniqueLines(text, start, lineEnd(text, index));
  const before = text.slice(from, to);
  const offset = start - from;
  return { before, after: `${before.slice(0, offset)}${newLine}\n${before.slice(offset)}` };
}

/**
 * Applies a text patch to `text`. Command patches don't change text and are returned unchanged.
 * Throws if `before` is missing, so a broken patch can't silently do nothing.
 */
export function applyPatch(text: string, patch: Patch): string {
  if ('command' in patch) return text;
  const at = text.indexOf(patch.before);
  if (at === -1) throw new Error('Patch does not apply: the "before" text was not found.');
  return text.slice(0, at) + patch.after + text.slice(at + patch.before.length);
}
