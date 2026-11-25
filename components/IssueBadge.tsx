import type { Issue } from '@/lib/doctor';

export function IssueHeader({ issue }: { issue: Issue }) {
  const where = issue.line ? `${issue.source} line ${issue.line}` : issue.source;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={issue.confidence === 'certain' ? 'rounded bg-red-100 px-2 py-0.5 font-medium text-red-800' : 'rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800'}>
        {issue.confidence}
      </span>
      <code className="text-slate-600">{issue.ruleId}</code>
      <span className="text-slate-500">{where}</span>
    </div>
  );
}
