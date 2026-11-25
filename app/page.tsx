import Link from 'next/link';
import { DoctorApp } from '@/components/DoctorApp';

export default function Home() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Experiment Doctor</h1>
        <p className="text-slate-700">
          Flagsmith experiments lose events silently: the SDKs skip bad events instead of throwing. Paste your code to find
          the setup bugs before they cost you your results.
        </p>
        <p className="text-sm text-slate-500">
          This page is itself an A/B test run with Flagsmith Experimentation.{' '}
          <Link className="underline" href="/results">
            See the experiment in the open
          </Link>
          .
        </p>
      </header>
      <DoctorApp />
    </div>
  );
}
