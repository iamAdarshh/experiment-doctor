'use client';

// Everything below the input after a scan. The headline, the clean state, "not checked" and the result ID are the
// same in both arms; only the issue list comes in the visitor's arm (IssueList or PatchList).

import type { ReactNode, RefObject } from 'react';
import type { DoctorResult } from '@/lib/doctor';
import { headline, type Summary } from '@/lib/present';
import { CheckIcon, ChevronIcon } from './icons';

type Props = {
  result: DoctorResult;
  summary: Summary;
  resultId: string;
  /** Set on re-scans: how many blocking issues the previous scan had. */
  previousCertain: number | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  issueList: ReactNode;
};

export function ResultView({ result, summary, resultId, previousCertain, headingRef, issueList }: Props) {
  const certainNow = summary.kind === 'issues' ? summary.certain : 0;
  const fixedEverything = summary.kind !== 'issues' && summary.kind !== 'nothing-checked' && (previousCertain ?? 0) > 0;

  return (
    <section aria-labelledby="result-heading" className="scroll-mt-6 space-y-5">
      <div role="status" className="space-y-1.5">
        {previousCertain !== null && summary.kind !== 'nothing-checked' && (
          <p className="text-sm font-medium text-muted">
            Re-scanned: {previousCertain} blocking before, {certainNow} now.
          </p>
        )}
        {summary.kind === 'clean' || summary.kind === 'possible-only' ? (
          <CleanBanner summary={summary} fixedEverything={fixedEverything} headingRef={headingRef} />
        ) : (
          <h2
            id="result-heading"
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-2xl font-semibold tracking-tight focus:outline-none sm:text-3xl"
          >
            {headline(summary)}
          </h2>
        )}
        {summary.kind === 'nothing-checked' && <p className="text-muted">{summary.reason} Paste JavaScript or TypeScript that uses a Flagsmith SDK.</p>}
      </div>

      {result.issues.length > 0 && issueList}

      {result.parseErrors.length > 0 && (
        <div className="rounded-xl border border-certain-800/20 bg-certain-50 p-4 text-sm text-certain-800">
          <h3 className="font-semibold">Part of the input could not be read</h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {result.parseErrors.map((error, index) => (
              <li key={index}>
                {error.source} line {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.notChecked.length > 0 && summary.kind !== 'nothing-checked' && (
        // Open by default when nothing was found, so a partial check never reads as a full all-clear.
        <details key={resultId} open={result.issues.length === 0} className="group rounded-xl border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronIcon className="size-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
            <span>
              {result.notChecked.length} check{result.notChecked.length === 1 ? '' : 's'} not run
              <span className="font-normal text-muted">, so this is not a full all-clear</span>
            </span>
          </summary>
          <ul className="space-y-1.5 px-4 pb-4 pl-10 text-sm">
            {result.notChecked.map((item) => (
              <li key={item.ruleId}>
                <code className="font-mono text-[13px]">{item.ruleId}</code>: <span className="text-muted">{item.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-muted">
        Result ID <code className="font-mono">{resultId}</code> · engine {result.engineVersion}. The same ID always means the
        same output.
      </p>
    </section>
  );
}

function CleanBanner({
  summary,
  fixedEverything,
  headingRef,
}: {
  summary: Extract<Summary, { kind: 'clean' } | { kind: 'possible-only' }>;
  fixedEverything: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const partial = summary.kind === 'clean' && summary.notChecked > 0;
  return (
    <div className="settle-in flex items-start gap-4 rounded-2xl border border-leaf-200 bg-leaf-50 p-5 text-leaf-800 sm:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf-700 text-white">
        <CheckIcon className="clean-check size-6" />
      </span>
      <div className="space-y-1">
        <h2 id="result-heading" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold tracking-tight focus:outline-none sm:text-3xl">
          {fixedEverything && summary.kind === 'clean' ? 'All fixed. ' : ''}
          {headline(summary)}
        </h2>
        <p>
          {summary.kind === 'possible-only'
            ? 'Nothing here will certainly lose events. Look over the possible issues below.'
            : partial
              ? 'Add more context above to run the remaining checks.'
              : 'Your setup should record experiment events. Nice work.'}
        </p>
      </div>
    </div>
  );
}
