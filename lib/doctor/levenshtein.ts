// Edit distance between two strings: the fewest single-character inserts, deletes or swaps to turn one
// into the other. Used to suggest the metric name closest to a mistyped event name.
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The closest candidate. Ties go to the alphabetically first name, so the answer never depends on input order. */
export function closest(name: string, candidates: string[]): string | undefined {
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of [...candidates].sort()) {
    const distance = levenshtein(name, candidate);
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best?.candidate;
}
