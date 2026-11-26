import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  // Fixtures and corpus files are sample user code (often deliberately broken), not our code.
  { ignores: ['.next/**', 'node_modules/**', '.claude/**', 'lib/doctor/fixtures/**', 'tests/corpus/**', 'tests/real-world/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // The doctor engine must stay pure (docs/07-determinism.md). Lint blocks the obvious leaks.
    files: ['lib/doctor/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'Date', 'localStorage', 'fetch', 'crypto', 'window', 'document'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random' }],
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'next', 'next/*', '@flagsmith/*'] }],
    },
  },
];

export default config;
