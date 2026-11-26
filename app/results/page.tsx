// The public "experiment in the open" page: the pre-registered design plus live numbers from Flagsmith.
// TODO(team): once the results JSON shape is known from a real experiment, show per-variation numbers as a
// table instead of raw JSON.
import { fetchExperimentResults } from '@/lib/server/experiment-results';

export const revalidate = 300;

export default async function ResultsPage() {
  const results = await fetchExperimentResults();
  return (
    <div className="max-w-3xl space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">The experiment, in the open</h1>
        <p className="max-w-[65ch] text-lg text-muted">
          The scan page is an A/B test run with Flagsmith Experimentation. Here is what we decided before launch, and the live
          numbers.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Pre-registered design</h2>
        <ul className="max-w-[70ch] list-disc space-y-2 pl-5 leading-relaxed marker:text-muted">
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

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Live results</h2>
        {results.status === 'ok' && (
          <>
            <p className="text-sm text-muted">Fetched {results.fetchedAt} (refreshed at most every 5 minutes).</p>
            <pre className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[13px] text-paper">{JSON.stringify(results.results, null, 2)}</pre>
          </>
        )}
        {results.status === 'not-configured' && <p className="rounded-xl border border-line bg-white p-4 text-muted">The experiment has not started yet. Numbers appear here once it is running.</p>}
        {results.status === 'error' && <p>Results are unavailable right now ({results.message}).</p>}
      </section>
    </div>
  );
}
