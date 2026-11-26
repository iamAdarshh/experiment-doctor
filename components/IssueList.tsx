// Control arm (`issues`): what is wrong, where, and the Flagsmith docs page that explains it.
import type { Issue } from '@/lib/doctor';
import { DocsLink, IssueCard } from './IssueCard';

type Props = { issues: Issue[]; locate: (issue: Issue) => string };

export function IssueList({ issues, locate }: Props) {
  return (
    <ol className="space-y-3">
      {issues.map((issue, index) => (
        <IssueCard key={index} issue={issue} location={locate(issue)} action={<DocsLink issue={issue} />} />
      ))}
    </ol>
  );
}
