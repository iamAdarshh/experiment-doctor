// Experiment Doctor on the command line.
//   npm run doctor -- <project folder> [--format issues|patch|json] [--metrics a,b] [--flag-json file]
// Exit code 1 when there is at least one certain issue, so it can gate CI.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { certainIssues, runChecks } from '../lib/doctor';
import { formatResult, type Arm } from '../lib/doctor/format';
import { readWorkspace } from './workspace';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const folder = process.argv[2];
if (!folder || folder.startsWith('--')) {
  console.error('Usage: npm run doctor -- <project folder> [--format issues|patch|json] [--metrics a,b] [--flag-json file]');
  process.exit(2);
}

const workspace = readWorkspace(resolve(folder));
const metrics = option('metrics');
const flagJsonFile = option('flag-json');
if (metrics) workspace.input.metricNames = metrics.split(',');
if (flagJsonFile) workspace.input.flagJson = readFileSync(flagJsonFile, 'utf8');

const result = runChecks(workspace.input);
const format = option('format') ?? 'patch';
if (format === 'json') console.log(JSON.stringify(result, null, 2));
else console.log(formatResult(result, format as Arm, workspace.locate));
process.exit(certainIssues(result).length > 0 ? 1 : 0);
