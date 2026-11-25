// The public "experiment in the open" page: the pre-registered design plus live numbers from Flagsmith.
// TODO(team): once the results JSON shape is known from a real experiment, show per-variation numbers as a
// table instead of raw JSON.
import Link from 'next/link';
import { fetchExperimentResults } from '@/lib/server/experiment-results';

export const revalidate = 300;

export default async function ResultsPage() {
  const results = await fetchExperimentResults();
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm underline">
        Back to the doctor
      </Link>
      <h1 className="text-3xl font-bold">The experiment, in the open</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Pre-registered design</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Hypothesis: showing a ready-made fix (variant <code>patch</code>) instead of an issue list with docs links (control{' '}
            <code>issues</code>) raises the share of teams that reach a clean re-scan in one visit, without slowing them down.
          </li>
          <li>
            Flag <code>fix_presentation</code>, split 50/50. Only visitors whose first scan finds a blocking issue are enrolled.
          </li>
          <li>
            Primary metric <code>rescan_clean</code> (occurrence, increase). Guardrail <code>minutes_to_clean</code> (mean, should
            not increase). Secondary <code>rescan_count</code>.
          </li>
          <li>Stopping rule: results are read at 12:00 PM IST on 29 Nov 2026, not before. Ship only above 95% chance to beat control.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Live results</h2>
        {results.status === 'ok' && (
          <>
            <p className="text-sm text-slate-500">Fetched {results.fetchedAt} (refreshed at most every 5 minutes).</p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-sm text-slate-100">{JSON.stringify(results.results, null, 2)}</pre>
          </>
        )}
        {results.status === 'not-configured' && <p>The experiment has not started yet.</p>}
        {results.status === 'error' && <p>Results are unavailable right now ({results.message}).</p>}
      </section>
    </div>
  );
}
