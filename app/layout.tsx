import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FlagsmithProvider } from '@/components/FlagsmithProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Experiment Doctor for Flagsmith',
  description: 'Paste your Flagsmith code and find the setup bugs that make experiment events disappear silently.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <FlagsmithProvider>
          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        </FlagsmithProvider>
      </body>
    </html>
  );
}
