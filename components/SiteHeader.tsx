'use client';

// Top bar shared by both pages: the wordmark and the two places you can go.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PulseIcon } from './icons';

const LINKS = [
  { href: '/', label: 'Scan your code' },
  { href: '/results', label: 'The experiment' },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <PulseIcon className="size-6 text-ink" />
          Experiment Doctor
        </Link>
        <nav aria-label="Main">
          <ul className="flex gap-1 text-sm font-medium">
            {LINKS.map((link) => {
              const current = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? 'page' : undefined}
                    className={`inline-block rounded-full px-3 py-1.5 transition-colors ${current ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink'}`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
