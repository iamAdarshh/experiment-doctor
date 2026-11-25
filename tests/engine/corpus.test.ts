// False-positive corpus: correct code must produce zero issues (docs/07-determinism.md, test 4).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../lib/doctor';

const CORPUS_DIR = join(__dirname, '..', 'corpus');
const files = readdirSync(CORPUS_DIR).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file)).sort();

describe('false-positive corpus', () => {
  it('has files', () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    it(`${file} has no issues`, () => {
      const code = readFileSync(join(CORPUS_DIR, file), 'utf8');
      const result = runChecks({ code, metricNames: ['purchase'] });
      expect(result.parseErrors).toEqual([]);
      expect(result.issues).toEqual([]);
    });
  }
});
