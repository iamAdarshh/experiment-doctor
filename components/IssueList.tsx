// Control arm (`issues`): what is wrong, where, and the Flagsmith docs page that explains it.
import type { Issue } from '@/lib/doctor';
import { IssueHeader } from './IssueBadge';

export function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ol className="space-y-3">
      {issues.map((issue, index) => (
        <li key={index} className="rounded-md border border-slate-200 bg-white p-4">
          <IssueHeader issue={issue} />
          <p className="mt-2">{issue.message}</p>
          <a className="mt-1 inline-block text-sm text-indigo-700 underline" href={issue.docsUrl} target="_blank" rel="noreferrer">
            Read the Flagsmith docs
          </a>
        </li>
      ))}
    </ol>
  );
}
