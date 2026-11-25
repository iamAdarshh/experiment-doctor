'use client';

// Variant arm (`patch`): the same issues, each with a ready-made fix and a copy button.
import { useState } from 'react';
import type { Issue } from '@/lib/doctor';
import { IssueHeader } from './IssueBadge';

type Props = { issues: Issue[]; onCopy: () => void };

export function PatchList({ issues, onCopy }: Props) {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopied(index);
    onCopy();
  }

  return (
    <ol className="space-y-3">
      {issues.map((issue, index) => {
        const patch = issue.patch;
        const copyText = patch ? ('command' in patch ? patch.command : patch.after) : null;
        return (
          <li key={index} className="rounded-md border border-slate-200 bg-white p-4">
            <IssueHeader issue={issue} />
            <p className="mt-2">{issue.message}</p>
            {patch && 'command' in patch && (
              <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-sm text-slate-100">{patch.command}</pre>
            )}
            {patch && !('command' in patch) && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">Replace</div>
                  <pre className="overflow-x-auto rounded bg-red-50 p-3 text-sm text-red-900">{patch.before}</pre>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">With</div>
                  <pre className="overflow-x-auto rounded bg-emerald-50 p-3 text-sm text-emerald-900">{patch.after}</pre>
                </div>
              </div>
            )}
            {copyText !== null ? (
              <button type="button" onClick={() => void copy(copyText, index)} className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900">
                {copied === index ? 'Copied' : 'Copy fix'}
              </button>
            ) : (
              <a className="mt-2 inline-block text-sm text-indigo-700 underline" href={issue.docsUrl} target="_blank" rel="noreferrer">
                No automatic fix for this one; read the Flagsmith docs
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
