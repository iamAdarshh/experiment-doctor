'use client';

// The input area. Only the code box is required; the three optional boxes sit behind "Add more context" and each
// says which check it unlocks. Ctrl/Cmd + Enter scans from any box.

import type { KeyboardEvent, RefObject } from 'react';
import { ChevronIcon, LockIcon } from './icons';

export type CodeInputValue = { code: string; dependencies: string; metricNames: string; flagJson: string };

type Props = {
  value: CodeInputValue;
  onChange: (value: CodeInputValue) => void;
  onScan: () => void;
  onLoadExample: () => void;
  onUndoExample: (() => void) | null;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  busy: boolean;
  codeError: string | null;
  codeRef: RefObject<HTMLTextAreaElement | null>;
};

const boxClass =
  'block w-full resize-y rounded-xl border border-line bg-white p-3.5 font-mono text-[13px] leading-relaxed text-ink placeholder:text-muted transition-colors hover:border-line-strong focus:border-ink focus:outline-2 focus:outline-offset-0 focus:outline-ink/15';

const OPTIONAL_BOXES = [
  {
    field: 'dependencies',
    label: 'Dependency file',
    hint: 'Checks your Flagsmith SDK is new enough to send experiment events.',
    placeholder: 'e.g. package.json, requirements.txt, go.mod',
  },
  {
    field: 'metricNames',
    label: 'Metric names, one per line',
    hint: 'Checks every trackEvent name matches a metric exactly (names are case-sensitive).',
    placeholder: 'e.g. purchase',
  },
  {
    field: 'flagJson',
    label: 'Flag JSON',
    hint: 'Output of flagsmith feature get <flag> --json. Checks every variation has a valid key.',
    placeholder: 'e.g. { "multivariate_options": [ … ] }',
  },
] as const;

export function CodeInput(props: Props) {
  const { value, onChange, onScan, busy, codeError, codeRef } = props;
  const set = (field: keyof CodeInputValue) => (event: React.ChangeEvent<HTMLTextAreaElement>) =>
    onChange({ ...value, [field]: event.target.value });
  const filledOptional = OPTIONAL_BOXES.filter((box) => value[box.field].trim() !== '').length;

  function scanOnShortcut(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onScan();
    }
  }

  return (
    <section aria-labelledby="input-heading" className="space-y-5" onKeyDown={scanOnShortcut}>
      <h2 id="input-heading" className="sr-only">
        Your code
      </h2>
      <p className="flex items-center gap-2 text-sm text-muted">
        <LockIcon className="size-4 shrink-0 text-ink" />
        Your code never leaves your browser. All checks run locally; nothing you paste is sent anywhere.
      </p>

      <div className="space-y-2">
        <label htmlFor="code" className="block font-semibold">
          Flagsmith code <span className="font-normal text-muted">(JavaScript or TypeScript)</span>
        </label>
        <p id="code-hint" className="text-sm text-muted">
          Several files? Start each one with a line <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[13px] whitespace-nowrap text-ink">{'// @file path'}</code>
        </p>
        <textarea
          id="code"
          ref={codeRef}
          className={`${boxClass} h-56 sm:h-80 ${codeError ? 'border-certain-800' : ''}`}
          value={value.code}
          onChange={set('code')}
          spellCheck={false}
          aria-describedby={codeError ? 'code-hint code-error' : 'code-hint'}
          aria-invalid={codeError ? true : undefined}
        />
        {codeError && (
          <p id="code-error" className="text-sm font-medium text-certain-800">
            {codeError}
          </p>
        )}
      </div>

      <details
        className="group rounded-xl border border-line bg-surface"
        open={props.moreOpen}
        onToggle={(event) => props.onMoreOpenChange(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronIcon className="size-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
          <span>
            Add more context{' '}
            <span className="font-normal text-muted">
              {filledOptional > 0 ? `(${filledOptional} of 3 added)` : '(optional, unlocks 3 more checks)'}
            </span>
          </span>
        </summary>
        <div className="grid gap-5 px-4 pt-1 pb-4 md:grid-cols-3">
          {OPTIONAL_BOXES.map((box) => (
            <div key={box.field} className="flex flex-col gap-1.5">
              <label htmlFor={box.field} className="text-sm font-semibold">
                {box.label}
              </label>
              <p id={`${box.field}-hint`} className="text-sm text-muted">
                {box.hint}
              </p>
              <textarea
                id={box.field}
                className={`${boxClass} mt-auto h-32`}
                value={value[box.field]}
                onChange={set(box.field)}
                placeholder={box.placeholder}
                spellCheck={false}
                aria-describedby={`${box.field}-hint`}
              />
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onScan}
          disabled={busy}
          aria-busy={busy || undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white transition-colors hover:bg-ink-soft disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? 'Scanning…' : 'Scan'}
        </button>
        <button
          type="button"
          onClick={props.onLoadExample}
          className="inline-flex min-h-11 items-center rounded-full px-4 font-medium text-ink underline decoration-ink/30 hover:decoration-ink"
        >
          Load a broken example
        </button>
        {props.onUndoExample && (
          <span role="status" className="text-sm text-muted">
            Example loaded.{' '}
            <button type="button" onClick={props.onUndoExample} className="font-medium text-ink underline">
              Undo
            </button>
          </span>
        )}
        <span className="ml-auto hidden text-sm text-muted sm:inline">
          <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd> or{' '}
          <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-xs">⌘</kbd> +{' '}
          <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-xs">Enter</kbd> to scan
        </span>
      </div>
    </section>
  );
}
