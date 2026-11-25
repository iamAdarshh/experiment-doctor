// The `doctor` tool for the agent experiment (docs/10-agent-experiment.md). The runner (Anmol) imports
// runDoctorTool and returns its text to the agent. It is the agent's only help.
// - arm 'issues' (control): issue list with docs links
// - arm 'patch'  (variant): the same issues with ready-made fixes
// Deterministic: same workspace + arm -> same text. No network, no LLM.

import { runChecks, certainIssues } from '../../lib/doctor';
import { formatResult, type Arm } from '../../lib/doctor/format';
import { readWorkspace } from '../workspace';

export type DoctorToolOutput = { text: string; certainIssueCount: number; engineVersion: string };

export function runDoctorTool(workspaceDir: string, arm: Arm): DoctorToolOutput {
  const workspace = readWorkspace(workspaceDir);
  const result = runChecks(workspace.input);
  return {
    text: formatResult(result, arm, workspace.locate),
    certainIssueCount: certainIssues(result).length,
    engineVersion: result.engineVersion,
  };
}

// Run directly for a quick look: npx tsx scripts/agents/doctor-tool.ts <workspace> <issues|patch>
if (require.main === module) {
  const [dir, arm] = process.argv.slice(2);
  if (!dir || (arm !== 'issues' && arm !== 'patch')) {
    console.error('Usage: npx tsx scripts/agents/doctor-tool.ts <workspace> <issues|patch>');
    process.exit(2);
  }
  console.log(runDoctorTool(dir, arm).text);
}
