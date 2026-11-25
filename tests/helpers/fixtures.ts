// Loads lib/doctor/fixtures/<ruleId>/ into DoctorInputs.
// Each fixture folder has broken.<ext>, fixed.<ext>, context.json and expected.json.
// context.json says which box broken/fixed go into ("box") and gives the other boxes (e.g. metricNames).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DoctorInput, InputBox, Issue, RuleId } from '../../lib/doctor';

export const FIXTURES_DIR = join(__dirname, '..', '..', 'lib', 'doctor', 'fixtures');

type Context = { box: InputBox; metricNames?: string[]; code?: string; dependencies?: string; flagJson?: string };

export type Fixture = {
  ruleId: RuleId;
  box: InputBox;
  broken: DoctorInput;
  fixed: DoctorInput;
  expected: Issue[];
};

function withBox(context: Context, text: string): DoctorInput {
  const input: DoctorInput = { code: context.code ?? '' };
  if (context.metricNames) input.metricNames = context.metricNames;
  if (context.dependencies) input.dependencies = context.dependencies;
  if (context.flagJson) input.flagJson = context.flagJson;
  if (context.box === 'code') input.code = text;
  if (context.box === 'dependencies') input.dependencies = text;
  if (context.box === 'flagJson') input.flagJson = text;
  return input;
}

export function loadFixture(ruleId: RuleId): Fixture {
  const dir = join(FIXTURES_DIR, ruleId);
  const files = readdirSync(dir);
  const brokenFile = files.find((file) => file.startsWith('broken.'));
  const fixedFile = files.find((file) => file.startsWith('fixed.'));
  if (!brokenFile || !fixedFile) throw new Error(`Fixture ${ruleId} needs broken.* and fixed.*`);
  const context = JSON.parse(readFileSync(join(dir, 'context.json'), 'utf8')) as Context;
  const expectedPath = join(dir, 'expected.json');
  const expected = files.includes('expected.json') ? (JSON.parse(readFileSync(expectedPath, 'utf8')) as Issue[]) : [];
  return {
    ruleId,
    box: context.box,
    broken: withBox(context, readFileSync(join(dir, brokenFile), 'utf8')),
    fixed: withBox(context, readFileSync(join(dir, fixedFile), 'utf8')),
    expected,
  };
}

/** The text of one input box. */
export function boxText(input: DoctorInput, box: InputBox): string {
  if (box === 'code') return input.code;
  if (box === 'dependencies') return input.dependencies ?? '';
  if (box === 'flagJson') return input.flagJson ?? '';
  return (input.metricNames ?? []).join('\n');
}

export function withBoxText(input: DoctorInput, box: InputBox, text: string): DoctorInput {
  if (box === 'code') return { ...input, code: text };
  if (box === 'dependencies') return { ...input, dependencies: text };
  if (box === 'flagJson') return { ...input, flagJson: text };
  return { ...input, metricNames: text.split('\n') };
}
