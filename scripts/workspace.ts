// Collects a project folder into one DoctorInput: every JS/TS source file (joined with `// @file` markers,
// which the engine parses one by one), package.json as the dependency file, and optional metrics.txt and
// flag.json. Also maps a line in the joined code back to "file:line" for readable output.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DoctorInput, Issue } from '../lib/doctor';

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'fixtures', 'corpus']);

function listSources(root: string, dir: string, out: string[]) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) listSources(root, full, out);
    } else if (SOURCE.test(name) && !name.endsWith('.d.ts') && !name.includes('.test.')) {
      out.push(relative(root, full));
    }
  }
}

export type Workspace = { input: DoctorInput; locate: (issue: Issue) => string | undefined };

export function readWorkspace(root: string, only?: string[]): Workspace {
  const files: string[] = only ?? [];
  if (!only) listSources(root, root, files);
  const starts: { path: string; startLine: number }[] = [];
  const parts: string[] = [];
  let line = 1;
  for (const path of files) {
    const content = readFileSync(join(root, path), 'utf8').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    starts.push({ path, startLine: line });
    const part = `// @file ${path}\n${content}`;
    parts.push(part);
    line += part.split('\n').length;
  }

  const read = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : undefined);
  const metrics = read('metrics.txt');
  const input: DoctorInput = {
    code: parts.join('\n'),
    dependencies: read('package.json'),
    metricNames: metrics?.split(/[\n,]/),
    flagJson: read('flag.json'),
  };

  // The marker line takes one line, so file line N is joined line startLine + N.
  const locate = (issue: Issue) => {
    if (issue.source !== 'code' || issue.line === undefined) return undefined;
    const file = [...starts].reverse().find((start) => start.startLine <= issue.line!);
    return file ? `${file.path}:${issue.line - file.startLine}` : undefined;
  };
  return { input, locate };
}
