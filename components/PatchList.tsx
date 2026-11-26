'use client';

// Variant arm (`patch`): the same issue cards, with a ready-made fix and a copy button in place of the docs link.
// Issues without a fix show the same docs link as the control arm.
import { useEffect, useState } from 'react';
import type { Issue, Patch } from '@/lib/doctor';
import { CheckIcon, CopyIcon } from './icons';
import { DocsLink, IssueCard } from './IssueCard';

type Props = { issues: Issue[]; locate: (issue: Issue) => string; onCopy: () => void };

export function PatchList({ issues, locate, onCopy }: Props) {
  return (
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

function FixBlock({ patch, onCopy }: { patch: Patch; onCopy: () => void }) {
  const [state, setState] = useState<CopyState>('idle');
  const copyText = 'command' in patch ? patch.command : patch.after;

  // "Copied" is a moment, not a state to keep: reset it so a second copy also gets feedback.
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setState('copied');
      onCopy();
    } catch {
      setState('failed');
    }
  }

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
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-ink"
        >
          {state === 'copied' ? <CheckIcon className="size-4 text-leaf-700" /> : <CopyIcon className="size-4" />}
          {state === 'copied' ? 'Copied' : 'Copy fix'}
        </button>
        <span role="status" className="text-sm text-muted">
          {state === 'failed' && 'Copy was blocked by the browser. Select the code above and copy it yourself.'}
        </span>
      </div>
    </div>
  );
}
