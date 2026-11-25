// Decides which experiment events a scan produces. Pure functions (time is passed in), so the rules in
// docs/05-experiment-design.md are unit-tested in tests/scan-session.test.ts.
//
// - Enrolment: the first scan with at least one CERTAIN issue (that is when the issue list is shown).
//   Visitors whose first scans are clean are never enrolled.
// - rescan_count: every scan after the first one, once enrolled.
// - rescan_clean + minutes_to_clean: the first scan with 0 certain issues after an earlier scan had >= 1.
//   minutes_to_clean = minutes since the visit's first scan.

export type ScanSession = {
  scans: number;
  firstScanAtMs: number | null;
  enrolled: boolean;
  hadCertainIssues: boolean;
  reachedClean: boolean;
};

export type ExperimentEvent =
  | { name: 'rescan_count' }
  | { name: 'rescan_clean' }
  | { name: 'minutes_to_clean'; value: number };

export const NEW_SESSION: ScanSession = {
  scans: 0,
  firstScanAtMs: null,
  enrolled: false,
  hadCertainIssues: false,
  reachedClean: false,
};

export type ScanOutcome = {
  session: ScanSession;
  /** True exactly once: on the scan where the visitor should be enrolled (exposure recorded). */
  enrollNow: boolean;
  events: ExperimentEvent[];
};

export function recordScan(previous: ScanSession, certainIssueCount: number, nowMs: number): ScanOutcome {
  const isRescan = previous.scans > 0;
  const firstScanAtMs = previous.firstScanAtMs ?? nowMs;
  const enrollNow = !previous.enrolled && certainIssueCount > 0;
  const enrolled = previous.enrolled || enrollNow;

  const events: ExperimentEvent[] = [];
  let reachedClean = previous.reachedClean;
  if (enrolled && isRescan) events.push({ name: 'rescan_count' });
  if (enrolled && certainIssueCount === 0 && previous.hadCertainIssues && !previous.reachedClean) {
    reachedClean = true;
    const minutes = Math.round(((nowMs - firstScanAtMs) / 60_000) * 100) / 100;
    events.push({ name: 'rescan_clean' }, { name: 'minutes_to_clean', value: minutes });
  }

  return {
    session: {
      scans: previous.scans + 1,
      firstScanAtMs,
      enrolled,
      hadCertainIssues: previous.hadCertainIssues || certainIssueCount > 0,
      reachedClean,
    },
    enrollNow,
    events,
  };
}
