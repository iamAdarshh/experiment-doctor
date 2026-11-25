// Regenerates lib/doctor/fixtures/*/expected.json from the current engine.
// Run it only after a deliberate rule change, then READ the diff: expected.json is the reviewed answer key.
//   npx tsx scripts/update-expected.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULE_ORDER, runChecks } from '../lib/doctor';
import { FIXTURES_DIR, loadFixture } from '../tests/helpers/fixtures';

for (const ruleId of RULE_ORDER) {
  const fixture = loadFixture(ruleId);
  const issues = runChecks(fixture.broken).issues;
  writeFileSync(join(FIXTURES_DIR, ruleId, 'expected.json'), `${JSON.stringify(issues, null, 2)}\n`);
  console.log(`${ruleId}: ${issues.length} issue(s)`);
}
