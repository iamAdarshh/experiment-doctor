'use client';

// Variant arm (`patch`): the same issue cards, with a ready-made fix and a copy button in place of the docs link.
// Issues without a fix show the same docs link as the control arm. When there are two or more code fixes, a
// "Copy all fixed code" panel above the list copies the whole scanned code with every code fix applied.
import { useEffect, useState } from 'react';
import type { Issue, Patch } from '@/lib/doctor';
import { applyCodeFixes, type FixedCode } from '@/lib/present';
import { CheckIcon, CopyIcon } from './icons';
import { DocsLink, IssueCard } from './IssueCard';

type Props = { issues: Issue[]; code: string; locate: (issue: Issue) => string; onCopy: () => void };

export function PatchList({ issues, code, locate, onCopy }: Props) {
  const fixed = applyCodeFixes(code, issues);
  return (
    <div className="space-y-4">
      {fixed.applied >= 2 && <CopyAllPanel fixed={fixed} onCopy={onCopy} />}
      <ol className="space-y-3">
        {issues.map((issue, index) => (
          <IssueCard
            key={index}
            issue={issue}
            location={locate(issue)}
            action={issue.patch ? <FixBlock patch={issue.patch} onCopy={onCopy} /> : <DocsLink issue={issue} />}
          />
        ))}
      </ol>
    </div>
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function CopyAllPanel({ fixed, onCopy }: { fixed: FixedCode; onCopy: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-semibold text-ink">Fix everything at once</h3>
      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted">
        Your code with {fixed.applied} fixes applied. Paste it over the code you scanned.
        {fixed.skipped > 0 &&
          ` ${fixed.skipped} ${plural(fixed.skipped, 'fix touches', 'fixes touch')} the same lines as another, so copy ${plural(fixed.skipped, 'it', 'them')} from ${plural(fixed.skipped, 'its card', 'their cards')} below.`}
        {fixed.elsewhere > 0 &&
          ` ${fixed.elsewhere} ${plural(fixed.elsewhere, 'fix is', 'fixes are')} outside your code (dependency file or a command); copy ${plural(fixed.elsewhere, 'it', 'them')} from ${plural(fixed.elsewhere, 'its card', 'their cards')}.`}
      </p>
      <div className="mt-4">
        <CopyButton text={fixed.text} label="Copy all fixed code" onCopy={onCopy} primary />
      </div>
    </div>
  );
}

const preClass = 'overflow-x-auto rounded-lg p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words';

/** Lines of code with a +/- gutter, so the change reads without relying on colour. The gutter is not copied. */
function CodeLines({ text, sign, className }: { text: string; sign: '+' | '-' | '$'; className: string }) {
  return (
    <pre className={`${preClass} ${className}`}>
      {text.split('\n').map((line, index) => (
        <span key={index} className="flex gap-3">
          <span aria-hidden className="select-none opacity-60">
            {sign}
          </span>
          <span className="min-w-0 flex-1">{line || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

type CopyState = 'idle' | 'copied' | 'failed';

/** A copy button with "Copied" feedback and a fallback message when the browser blocks the clipboard. */
function CopyButton({ text, label, onCopy, primary = false }: { text: string; label: string; onCopy: () => void; primary?: boolean }) {
  const [state, setState] = useState<CopyState>('idle');

  // "Copied" is a moment, not a state to keep: reset it so a second copy also gets feedback.
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      onCopy();
    } catch {
      setState('failed');
    }
  }

  const look = primary
    ? 'bg-ink text-white hover:bg-ink-soft'
    : 'border border-line bg-white text-ink hover:border-ink';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${look}`}
      >
        {state === 'copied' ? (
          <CheckIcon className={`size-4 ${primary ? '' : 'text-leaf-700'}`} />
        ) : (
          <CopyIcon className="size-4" />
        )}
        {state === 'copied' ? 'Copied' : label}
      </button>
      <span role="status" className="text-sm text-muted">
        {state === 'failed' && 'Copy was blocked by the browser. Select the code and copy it yourself.'}
      </span>
    </div>
  );
}

function FixBlock({ patch, onCopy }: { patch: Patch; onCopy: () => void }) {
  return (
    <div className="space-y-3">
      {'command' in patch ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">Run</div>
          <CodeLines text={patch.command} sign="$" className="bg-ink text-paper" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted">Replace</div>
            <CodeLines text={patch.before} sign="-" className="bg-certain-50 text-certain-800" />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted">With</div>
            <CodeLines text={patch.after} sign="+" className="bg-leaf-50 text-leaf-800" />
          </div>
        </div>
      )}
      <CopyButton text={'command' in patch ? patch.command : patch.after} label="Copy fix" onCopy={onCopy} />
    </div>
  );
}
