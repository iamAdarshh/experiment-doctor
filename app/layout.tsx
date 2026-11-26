import type { Metadata } from 'next';
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { FlagsmithProvider } from '@/components/FlagsmithProvider';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// next/font downloads these at build time and serves them from our own domain (no request to Google at runtime).
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Experiment Doctor for Flagsmith',
  description: 'Paste your Flagsmith code and find the setup bugs that make experiment events disappear silently.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <FlagsmithProvider>
          <a
            href="#main"
            className="sr-only rounded-md bg-ink px-3 py-2 text-paper focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto max-w-5xl px-5 pt-8 pb-16 sm:px-6 sm:pt-12">
            {children}
          </main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
              <p>An independent tool for Flagsmith users. Not affiliated with Flagsmith.</p>
              <a className="underline hover:text-ink" href="https://github.com/iamAdarshh/experiment-doctor">
                Source on GitHub
              </a>
            </div>
          </footer>
        </FlagsmithProvider>
      </body>
    </html>
  );
}
