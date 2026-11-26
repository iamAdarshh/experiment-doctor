// One issue, as both experiment arms show it. The arms share this card so that they can differ in exactly one
// place, the `action` slot (PRODUCT.md, "Experiment integrity"):
//   control `issues`: <DocsLink>
//   variant `patch`:  <FixBlock> where the issue has a fix, otherwise the same <DocsLink> as control.

import type { ReactNode } from 'react';
import type { Issue } from '@/lib/doctor';
import { AlertIcon } from './icons';

const CONFIDENCE = {
  certain: { label: 'Certain', className: 'bg-certain-50 text-certain-800' },
  possible: { label: 'Possible', className: 'bg-possible-50 text-possible-800' },
} as const;

type Props = { issue: Issue; location: string; action: ReactNode };

export function IssueCard({ issue, location, action }: Props) {
  const confidence = CONFIDENCE[issue.confidence];
  return (
    <li className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgb(17_18_20/0.04),0_4px_12px_-6px_rgb(17_18_20/0.08)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${confidence.className}`}>
          {issue.confidence === 'certain' && <AlertIcon className="size-3.5" />}
          {confidence.label}
        </span>
        <h3 className="font-mono text-sm font-medium text-ink">{issue.ruleId}</h3>
        <span className="text-muted">{location}</span>
      </div>
      <p className="mt-3 max-w-[70ch] leading-relaxed">{issue.message}</p>
      <div className="mt-4">{action}</div>
    </li>
  );
}

/** The docs link. Identical in both arms; the hidden text makes each link distinct for screen readers. */
export function DocsLink({ issue }: { issue: Issue }) {
  return (
    <a
      className="text-sm font-medium text-ink underline decoration-ink/40 hover:decoration-ink"
      href={issue.docsUrl}
      target="_blank"
      rel="noreferrer"
    >
      Read the Flagsmith docs
      <span className="sr-only">
        {' '}
        about {issue.ruleId} (opens in a new tab)
      </span>
    </a>
  );
}
