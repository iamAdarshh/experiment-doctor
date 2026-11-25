// `npm run doctor:self`: runs the doctor on our own Flagsmith code. CI fails if it finds a certain issue
// or can't check something it should. It's also a nice demo line: the doctor passes its own exam.

import { resolve } from 'node:path';
import { certainIssues, runChecks } from '../lib/doctor';
import { formatResult } from '../lib/doctor/format';
import { readWorkspace } from './workspace';

const root = resolve(__dirname, '..');
const workspace = readWorkspace(root, ['lib/experiment.ts', 'components/FlagsmithProvider.tsx']);
// Our metric names (docs/05-experiment-design.md). patch_copied is a plain logged event, not an experiment
// metric; it is listed here so the event-name check knows it is intentional.
workspace.input.metricNames = ['rescan_clean', 'minutes_to_clean', 'rescan_count', 'patch_copied'];

const result = runChecks(workspace.input);
console.log(formatResult(result, 'patch', workspace.locate));

// These checks need inputs we don't have here (flag JSON) and are fine to skip; anything else must run.
const allowedNotChecked = new Set(['variation-key']);
const unexpected = result.notChecked.filter((item) => !allowedNotChecked.has(item.ruleId));
if (certainIssues(result).length > 0 || result.parseErrors.length > 0 || unexpected.length > 0) {
  console.error('\nSelf-check failed.');
  process.exit(1);
}
console.log('\nSelf-check passed.');
