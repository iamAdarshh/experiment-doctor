---
name: add-doctor-rule
description: Add or change an Experiment Doctor check in lib/doctor/rules with fixtures, tests and a patch template. Use when asked to add, fix or tune a doctor rule or a false positive.
---

# Add or change a doctor rule

Follow docs/06-doctor-rules-spec.md (contract) and docs/07-determinism.md (non-negotiables).
Work in small steps and explain each one, so either teammate can explain the rule.

## Steps
1. **Confirm the failure is real.** Find the Flagsmith docs sentence that describes it
   (docs/04-flagsmith-experimentation-reference.md first, then the live docs). Quote it with the URL.
   No docs source means no `certain` rule; at most `possible`.
2. **Write fixtures first** in `lib/doctor/fixtures/<ruleId>/`:
   - `broken.<ext>`: the smallest realistic code that has the bug.
   - `fixed.<ext>`: the same code with the documented fix.
   - `expected.json`: the exact issues `runChecks` should return for `broken`.
3. **Write the failing test** in `tests/rules/<ruleId>.test.ts`: broken fires, fixed does not, patch round-trip.
   Run only that file: `npx vitest run tests/rules/<ruleId>.test.ts`.
4. **Implement** `lib/doctor/rules/<ruleId>.ts`:
   - Pure. No Date, Math.random, network, storage, env, React or Flagsmith imports.
   - Declare `needs`. If an input is missing, the engine reports "not checked".
   - Use the parsed AST from `RuleContext` for JS/TS; regex helpers only for other languages and dependency files.
   - Return line/column; message is one plain sentence; `docsUrl` is the exact docs page.
   - Patch is a template filled from parsed values, never free text.
5. **Register** the rule in `RULE_ORDER` (append; don't reorder existing rules).
6. **Bump `ENGINE_VERSION`** (minor for a new rule, patch for a fix that changes output).
7. **Run** the rule test, then `npm test` once (determinism + false-positive corpus).
8. **Explain**: end with a 5-line "what this rule does and why" note either of us could say to a judge.

## Checklist
- [ ] Docs source quoted
- [ ] broken fires / fixed silent / round-trip passes
- [ ] confidence correct (`certain` only for exact matches)
- [ ] corpus still zero issues
- [ ] ENGINE_VERSION bumped
