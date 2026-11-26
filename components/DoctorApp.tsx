'use client';

// The tool page: paste, scan, see results in the visitor's experiment arm.
// Order matters on the enrolling scan: the exposure (getExperimentFlag) is recorded before any conversion
// event is sent, because conversions only count after the first exposure.

import { useEffect, useState } from 'react';
import { certainIssues, runChecks, splitMetricNames, type DoctorInput, type DoctorResult } from '@/lib/doctor';
import { BROKEN_EXAMPLE } from '@/lib/example';
import { enrollAndGetPresentation, sendPatchCopied, sendScanEvents, type Presentation } from '@/lib/experiment';
import { resultId } from '@/lib/result-id';
import { NEW_SESSION, recordScan, type ScanSession } from '@/lib/scan-session';
import { CodeInput, type CodeInputValue } from './CodeInput';
import { IssueList } from './IssueList';
import { PatchList } from './PatchList';

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

export function DoctorApp() {
  const [value, setValue] = useState<CodeInputValue>(EMPTY);
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [id, setId] = useState<string>('');
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [session, setSession] = useState<ScanSession>(NEW_SESSION);

  useEffect(() => setSession(loadSession()), []);

  async function scan() {
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
    setResult(next);
    setSession(outcome.session);
    saveSession(outcome.session);
    setId(await resultId(input));
    await sendScanEvents(outcome.events);
  }

  const certainCount = result ? certainIssues(result).length : 0;
  const possibleCount = result ? result.issues.length - certainCount : 0;

  return (
    <div className="space-y-8">
      <CodeInput value={value} onChange={setValue} onScan={() => void scan()} onLoadExample={() => setValue(BROKEN_EXAMPLE)} />

      {result && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">
            {certainCount === 0 ? 'No blocking issues found' : `${certainCount} issue${certainCount === 1 ? '' : 's'} will lose experiment events`}
            {possibleCount > 0 && `${certainCount === 0 ? ', but' : ','} ${possibleCount} more might`}
          </h2>

          {result.issues.length > 0 &&
            (presentation === 'patch' ? (
              <PatchList issues={result.issues} onCopy={() => void sendPatchCopied()} />
            ) : (
              <IssueList issues={result.issues} />
            ))}

          {result.parseErrors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
              <div className="font-medium">Could not read part of the input</div>
              <ul className="mt-1 list-disc pl-5">
                {result.parseErrors.map((error, index) => (
                  <li key={index}>
                    {error.source} line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.notChecked.length > 0 && (
            <details className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                {result.notChecked.length} check{result.notChecked.length === 1 ? '' : 's'} not run, so this is not a full all-clear
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {result.notChecked.map((item) => (
                  <li key={item.ruleId}>
                    <code>{item.ruleId}</code>: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs text-slate-500">
            Result ID <code>{id}</code> · engine {result.engineVersion}. The same ID always means the same output.
          </p>
        </section>
      )}
    </div>
  );
}
