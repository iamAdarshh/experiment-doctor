// The contract every rule follows (docs/06-doctor-rules-spec.md, "Rule file contract").

import type { CodeAnalysis } from './parse';
import type { InputBox, Issue, NormalizedInput, RuleId } from './types';

export type RuleContext = {
  input: NormalizedInput;
  /** The parsed code. Rules that need code only run when it parsed and uses Flagsmith (the engine checks this).
   *  Other rules get it too when it parsed, or an empty fact list when there is no code or it didn't parse. */
  code: Extract<CodeAnalysis, { ok: true }>['facts'];
  /** True when code was pasted and parsed, so `code` really describes it (and isn't the empty fact list). */
  codeParsed: boolean;
};

/** A rule returns its issues, or says it could not decide (never a silent pass). */
export type RuleOutcome = Issue[] | { notChecked: string };

export type Rule = {
  id: RuleId;
  /** Input boxes the rule needs. If one is empty, the engine reports "not checked" instead of running it. */
  needs: InputBox[];
  check(context: RuleContext): RuleOutcome;
};
