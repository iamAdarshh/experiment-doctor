// Rule 5. Experiment events need recent SDKs. Minimums from the Flagsmith docs
// (docs/04-flagsmith-experimentation-reference.md): @flagsmith/flagsmith 12.4.0, @flagsmith/nodejs 9.1.0,
// Python flagsmith 6.3.0, Go v5.3.0, Java 8.2.0. The old `flagsmith-nodejs` package can't send events.

import { bumpSpec, judgeSpec, parseVersion, readDependencies, type DependencyEntry } from '../dependencies';
import { DOCS } from '../docs-links';
import { replaceRangePatch } from '../patch';
import type { Rule } from '../rule';
import type { Issue } from '../types';

type Minimum = { label: string; version: [number, number, number] };

function minimumFor(entry: DependencyEntry): Minimum | 'replaced-package' | undefined {
  if (entry.ecosystem === 'npm') {
    if (entry.name === '@flagsmith/flagsmith') return { label: '@flagsmith/flagsmith', version: [12, 4, 0] };
    if (entry.name === '@flagsmith/nodejs') return { label: '@flagsmith/nodejs', version: [9, 1, 0] };
    return 'replaced-package'; // `flagsmith-nodejs` and the old `flagsmith` npm package
  }
  if (entry.ecosystem === 'python') return { label: 'flagsmith (Python)', version: [6, 3, 0] };
  if (entry.ecosystem === 'go') return { label: 'flagsmith-go-client', version: [5, 3, 0] };
  return { label: 'flagsmith-java-client', version: [8, 2, 0] };
}

const NEW_NPM_NAME: Record<string, string> = {
  'flagsmith-nodejs': '@flagsmith/nodejs',
  flagsmith: '@flagsmith/flagsmith',
};

export const rule: Rule = {
  id: 'sdk-too-old',
  needs: ['dependencies'],
  check({ input }) {
    const text = input.dependencies ?? '';
    const entries = readDependencies(text);
    if (entries.length === 0) return { notChecked: 'No Flagsmith SDK was found in the dependency file.' };
    const issues: Issue[] = [];
    for (const entry of entries) {
      const minimum = minimumFor(entry);
      if (minimum === undefined) continue;
      if (minimum === 'replaced-package') {
        const newName = NEW_NPM_NAME[entry.name] ?? '@flagsmith/flagsmith';
        const newVersion = newName === '@flagsmith/nodejs' ? '9.1.0' : '12.4.0';
        const nameStart = text.lastIndexOf(`"${entry.name}"`, entry.specStart);
        issues.push({
          ruleId: 'sdk-too-old',
          confidence: 'certain',
          source: 'dependencies',
          line: entry.line,
          message: `The "${entry.name}" package can't send experiment events; switch to "${newName}" ${newVersion} or later (and update the imports).`,
          docsUrl: DOCS.runExperiment,
          patch: nameStart === -1 ? undefined : replaceRangePatch(text, nameStart, entry.specEnd + 1, `"${newName}": "^${newVersion}"`),
        });
        continue;
      }
      // Go modules below v5 live under another path (e.g. /v3) and are always too old.
      const goMajor = entry.ecosystem === 'go' ? /\/v(\d+)$/.exec(entry.name)?.[1] : undefined;
      const verdict = goMajor !== undefined && Number(goMajor) < 5 ? 'too-old' : judgeSpec(entry.spec, minimum.version);
      if (verdict === 'ok' || verdict === 'unknown') continue;
      const minimumText = minimum.version.join('.');
      const canBump = goMajor === undefined || Number(goMajor) >= 5;
      issues.push({
        ruleId: 'sdk-too-old',
        confidence: verdict === 'too-old' ? 'certain' : 'possible',
        source: 'dependencies',
        line: entry.line,
        message:
          verdict === 'too-old'
            ? `${minimum.label} ${entry.spec} is too old to send experiment events; use ${minimumText} or later.`
            : `${minimum.label} ${entry.spec} may resolve below ${minimumText}, which can't send experiment events; check your lockfile.`,
        docsUrl: DOCS.runExperiment,
        patch: canBump && parseVersion(entry.spec)
          ? replaceRangePatch(text, entry.specStart, entry.specEnd, bumpSpec(entry.spec, minimum.version))
          : undefined,
      });
    }
    return issues;
  },
};
