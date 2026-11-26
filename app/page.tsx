import Link from 'next/link';
import { DoctorApp } from '@/components/DoctorApp';
import { ArrowRightIcon, FlaskIcon } from '@/components/icons';

export default function Home() {
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Find the bugs that silently drop your experiment events
        </h1>
        <p className="max-w-[65ch] text-lg text-muted">
          Flagsmith experiments lose events silently: the SDKs skip bad events instead of throwing. Paste your code to find
          the setup bugs before they cost you your results.
        </p>
        <p className="flex items-start gap-2.5 text-muted">
          <FlaskIcon className="mt-0.5 size-5 shrink-0 text-ink" />
          <span>
            This page is itself an A/B test run with Flagsmith Experimentation.{' '}
            <Link className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-ink/40 hover:decoration-ink" href="/results">
              See the experiment in the open
              <ArrowRightIcon className="size-4" />
            </Link>
          </span>
        </p>
      </header>
      <DoctorApp />
    </div>
  );
}
