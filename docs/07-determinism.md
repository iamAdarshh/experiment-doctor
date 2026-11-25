# Deterministic and reliable output

Same input -> same issues, same order, same patches. CI enforces it. This also protects the experiment:
if output varied between scans, `rescan_clean` would partly measure noise.

## Engine rules
1. `runChecks(input)` is pure: no clock, randomness, network, storage or env.
2. Normalize first: CRLF -> LF, strip BOM and trailing whitespace; trim metric names (don't lowercase).
3. Sort issues by (RULE_ORDER index, line, column, message). Never rely on object/Set order.
4. Patches are fixed templates filled from parsed values. No LLM anywhere in the result path.
5. Exact dependency versions and a committed lockfile; parser version is part of `ENGINE_VERSION`.
6. `resultId = sha256(normalizedInput + ENGINE_VERSION)`, shown in the UI for reproducible bug reports.

## Reliability tests (all in CI)
1. Per rule: broken fixture fires, fixed fixture doesn't.
2. Patch round-trip: apply patch to broken, re-run, the rule no longer fires.
3. Determinism: run each fixture twice, with shuffled input box order and CRLF, compare byte-for-byte;
   plus `fast-check` property tests (whitespace, comment insertion, unrelated code).
4. False-positive corpus: correct Flagsmith snippets from docs/example repos must produce zero issues.
5. Confidence labels: `certain` (exact match) vs `possible` (heuristic). Only `certain` blocks a clean result.
6. Parse failures are reported with a line, and affected rules listed as "not checked". Never a silent all-clear.
7. `ENGINE_VERSION` sent as event metadata, so engine changes are visible in experiment data.

## Experiment-side determinism
Bucketing is deterministic on the identity key, and the visitor id persists in `localStorage`, so a visitor stays in one arm.
