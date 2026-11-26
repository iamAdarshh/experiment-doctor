'use client';

// The tool page: paste, scan, see results in the visitor's experiment arm.
// Order matters on the enrolling scan: the exposure (getExperimentFlag) is recorded before any conversion
// event is sent, because conversions only count after the first exposure.

import { useEffect, useRef, useState } from 'react';
import { certainIssues, runChecks, splitMetricNames, type DoctorInput, type DoctorResult, type Issue } from '@/lib/doctor';
import { BROKEN_EXAMPLE } from '@/lib/example';
import { enrollAndGetPresentation, sendPatchCopied, sendScanEvents, type Presentation } from '@/lib/experiment';
import { describeLocation, orderForDisplay, summarize } from '@/lib/present';
import { resultId } from '@/lib/result-id';
import { NEW_SESSION, recordScan, type ScanSession } from '@/lib/scan-session';
import { CodeInput, type CodeInputValue } from './CodeInput';
import { IssueList } from './IssueList';
import { PatchList } from './PatchList';
import { ResultView } from './ResultView';

const SESSION_KEY = 'experiment-doctor:scan-session';
const EMPTY: CodeInputValue = { code: '', dependencies: '', metricNames: '', flagJson: '' };

/** One visit = one browser tab session, so a page refresh keeps the scan history but a new visit starts fresh. */
function loadSession(): ScanSession {
  try {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    return saved ? (JSON.parse(saved) as ScanSession) : NEW_SESSION;
  } catch {
    return NEW_SESSION;
  }
}

function saveSession(session: ScanSession) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session still works for this page load.
  }
}

/** Without Flagsmith keys (local dev), `?arm=patch` previews the variant. No events are sent then. */
function previewArm(): Presentation {
  return new URLSearchParams(window.location.search).get('arm') === 'patch' ? 'patch' : 'issues';
}

function toDoctorInput(value: CodeInputValue): DoctorInput {
  return {
    code: value.code,
    dependencies: value.dependencies,
    metricNames: splitMetricNames(value.metricNames),
    flagJson: value.flagJson,
  };
}

function hasOptionalInput(value: CodeInputValue): boolean {
  return value.dependencies.trim() !== '' || value.metricNames.trim() !== '' || value.flagJson.trim() !== '';
}

type Scanned = { result: DoctorResult; code: string; id: string; previousCertain: number | null; scanNumber: number };

export function DoctorApp() {
  const [value, setValue] = useState<CodeInputValue>(EMPTY);
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [session, setSession] = useState<ScanSession>(NEW_SESSION);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [beforeExample, setBeforeExample] = useState<CodeInputValue | null>(null);

  const scanning = useRef(false); // blocks a second scan while one is running (a double click)
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setSession(loadSession()), []);

  // After each scan, move focus to the result headline (screen readers announce it) and bring it into view.
  useEffect(() => {
    if (!scanned) return;
    const heading = headingRef.current;
    if (!heading) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.focus({ preventScroll: true });
    heading.closest('section')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [scanned?.scanNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  function change(next: CodeInputValue) {
    setValue(next);
    setBeforeExample(null);
    if (codeError && next.code.trim() !== '') setCodeError(null);
  }

  function loadExample() {
    const hasInput = value.code.trim() !== '' || hasOptionalInput(value);
    setBeforeExample(hasInput ? value : null); // offer undo only when something would be lost
    setValue(BROKEN_EXAMPLE);
    setMoreOpen(true);
    setCodeError(null);
  }

  function undoExample() {
    if (!beforeExample) return;
    setValue(beforeExample);
    setMoreOpen(hasOptionalInput(beforeExample));
    setBeforeExample(null);
  }

  async function scan() {
    if (scanning.current) return;
    if (value.code.trim() === '') {
      setCodeError('Paste your Flagsmith code first. The other boxes are optional.');
      codeRef.current?.focus();
      return;
    }
    scanning.current = true;
    setBusy(true);
    try {
      const input = toDoctorInput(value);
      const next = runChecks(input);
      const outcome = recordScan(session, certainIssues(next).length, Date.now());

      // Ask for the arm on the enrolling scan, and again after a page refresh: the session (enrolled) survives
      // in sessionStorage but the arm does not, and without this an enrolled variant visitor would see control.
      // getExperimentFlag returns the same variant for the same identity, so asking twice is safe.
      if (outcome.session.enrolled && presentation === null) {
        const arm = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID ? await enrollAndGetPresentation() : previewArm();
        setPresentation(arm);
      }
      const id = await resultId(input);
      setScanned((previous) => ({
        result: next,
        code: value.code,
        id,
        previousCertain: previous ? certainIssues(previous.result).length : null,
        scanNumber: (previous?.scanNumber ?? 0) + 1,
      }));
      setSession(outcome.session);
      saveSession(outcome.session);
      setBeforeExample(null);
      await sendScanEvents(outcome.events);
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }

  const locate = (issue: Issue) => describeLocation(scanned?.code ?? '', issue);
  const issues = scanned ? orderForDisplay(scanned.result.issues) : [];

  return (
    <div className="space-y-12">
      <CodeInput
        value={value}
        onChange={change}
        onScan={() => void scan()}
        onLoadExample={loadExample}
        onUndoExample={beforeExample ? undoExample : null}
        moreOpen={moreOpen}
        onMoreOpenChange={setMoreOpen}
        busy={busy}
        codeError={codeError}
        codeRef={codeRef}
      />

      {scanned && (
        <ResultView
          key={scanned.scanNumber}
          result={scanned.result}
          summary={summarize(scanned.result)}
          resultId={scanned.id}
          previousCertain={scanned.previousCertain}
          headingRef={headingRef}
          issueList={
            presentation === 'patch' ? (
              <PatchList issues={issues} locate={locate} onCopy={() => void sendPatchCopied()} />
            ) : (
              <IssueList issues={issues} locate={locate} />
            )
          }
        />
      )}
    </div>
  );
}
