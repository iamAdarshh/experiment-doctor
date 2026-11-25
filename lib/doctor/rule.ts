// The contract every rule follows (docs/06-doctor-rules-spec.md, "Rule file contract").

import type { CodeAnalysis } from './parse';
import type { InputBox, Issue, NormalizedInput, RuleId } from './types';

export type RuleContext = {
  input: NormalizedInput;
  /** The parsed code. Rules that need code only run when `code.ok` is true (the engine checks this). */
  code: Extract<CodeAnalysis, { ok: true }>['facts'];
};

/** A rule returns its issues, or says it could not decide (never a silent pass). */
export type RuleOutcome = Issue[] | { notChecked: string };

export type Rule = {
  id: RuleId;
  /** Input boxes the rule needs. If one is empty, the engine reports "not checked" instead of running it. */
  needs: InputBox[];
  check(context: RuleContext): RuleOutcome;
};
