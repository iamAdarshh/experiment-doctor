import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // tests/real-world holds other projects' code (some ship their own tests); it is run by `npm run real-world`.
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/real-world/**', 'node_modules/**'], environment: 'node' },
});
