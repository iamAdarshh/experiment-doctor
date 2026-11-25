import type { DoctorInput, NormalizedInput } from './types';

/**
 * Makes text that looks the same produce the same result: strips a byte-order mark, turns CRLF and CR
 * into LF, and removes trailing spaces on every line. Used for every text box.
 */
export function normalizeText(text: string): string {
  const withoutBom = text.startsWith('﻿') ? text.slice(1) : text;
  const unixLines = withoutBom.replace(/\r\n?/g, '\n');
  return unixLines
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

/** Empty or whitespace-only boxes count as "not given". */
function optionalText(text: string | undefined): string | null {
  if (text === undefined) return null;
  const normalized = normalizeText(text);
  return normalized.trim() === '' ? null : normalized;
}

/**
 * Metric names are trimmed but NOT lowercased: Flagsmith matches event names to metric names
 * case-sensitively, so "Rescan_Clean" and "rescan_clean" are different metrics.
 * Duplicates are dropped, keeping the first one, so the order stays as the user typed it.
 */
function normalizeMetricNames(names: string[] | undefined): string[] | null {
  if (names === undefined) return null;
  const kept: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed !== '' && !kept.includes(trimmed)) kept.push(trimmed);
  }
  return kept.length === 0 ? null : kept;
}

export function normalizeInput(input: DoctorInput): NormalizedInput {
  return {
    code: normalizeText(input.code),
    dependencies: optionalText(input.dependencies),
    metricNames: normalizeMetricNames(input.metricNames),
    flagJson: optionalText(input.flagJson),
  };
}

/** Splits the metric-names text box (one name per line, commas also accepted) into a list. */
export function splitMetricNames(text: string): string[] {
  return text.split(/[\n,]/);
}
