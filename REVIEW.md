# Review checklist

Use this for every PR (the other teammate reviews each PR before merge). Claude: when asked to review, go through each
section and report only real findings, most severe first, with file:line.

## 1. Correctness of Flagsmith usage
- [ ] `enableEvents: true` is set wherever events or experiment flags are used.
- [ ] `identify(visitorId)` runs before `getExperimentFlag` / `trackEvent`.
- [ ] Exposure is recorded with `getExperimentFlag('fix_presentation')`, only where the issue list is shown.
- [ ] Event names exactly match metric names (case-sensitive): `rescan_clean`, `minutes_to_clean`, `rescan_count`.
- [ ] `rescan_clean` fires only when a scan has 0 certain issues AND an earlier scan in the session had >= 1.
- [ ] `minutes_to_clean` is sent as `{ value: <number> }` at the same moment as `rescan_clean`.
- [ ] `flushEvents()` after conversions and on `pagehide`.
- [ ] Every event includes `metadata.engine_version`.
- [ ] No experiment config change (flag, variation keys, metrics, rollout) while the experiment is running.

## 2. Determinism (see docs/07-determinism.md)
- [ ] Nothing in `lib/doctor/` imports React, Flagsmith, or uses `Date`, `Math.random`, `crypto.randomUUID`,
      network, `localStorage`, or env vars.
- [ ] Issues are sorted by (rule order, line, column, message). No reliance on object/Set iteration order.
- [ ] Input is normalized (LF, no BOM, trailing whitespace trimmed) before rules run.
- [ ] Patches are templates, not generated text.
- [ ] `ENGINE_VERSION` bumped if any rule's output changes.

## 3. Rule quality (for any new or changed rule)
- [ ] `fixtures/<rule>/broken.*` fires; `fixtures/<rule>/fixed.*` does not.
- [ ] Patch round-trip: applying the patch to broken makes the rule stop firing.
- [ ] Confidence is `certain` only for exact matches; heuristics are `possible`.
- [ ] If required input is missing (e.g. metric names), the rule reports "not checked", never a pass.
- [ ] Docs link points to the exact Flagsmith docs page for the problem.
- [ ] False-positive corpus still produces zero issues.
- [ ] `npm run real-world`: no new parse errors or new `certain` issues in `tests/real-world/REPORT.md` (commit the updated report).

## 4. Privacy and security
- [ ] Pasted code is never sent anywhere (check new fetch calls, analytics, error reporting).
- [ ] `FLAGSMITH_ADMIN_TOKEN` only used server-side; no `NEXT_PUBLIC_` secrets.
- [ ] No secrets, tokens or `.env` files committed.
- [ ] `/api/results` returns only aggregate experiment numbers and caches for 5 minutes.

## 5. Code clarity (ownership)
- [ ] Both teammates can explain every changed line without notes.
- [ ] Names say what things are; no clever one-liners; comments explain *why*, not *what*.
- [ ] Small functions; one rule per file in `lib/doctor/rules/`.
- [ ] No unused dependencies; exact versions pinned.

## 6. UX and demo
- [ ] Both arms render correctly (clear `localStorage` to switch identity).
- [ ] "Code never leaves your browser" notice is visible above the paste box.
- [ ] "Not checked" items are shown so a clean result is never a false all-clear.
- [ ] Works on a 1280px-wide screen recording.
