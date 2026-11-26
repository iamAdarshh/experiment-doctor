## What and why

<!-- What changed, in plain words, and why. The reviewer should be able to explain it to a judge. -->

## How it was tested

<!-- Commands run, fixtures added, screenshots for UI changes (both arms: clear localStorage to switch). -->

## Checklist (REVIEW.md)

- [ ] `npm run lint && npm run typecheck && npm test && npm run doctor:self` pass locally
- [ ] Both of us can explain every changed line without notes
- [ ] **Flagsmith:** `enableEvents: true`; `identify()` before experiment calls; exposure only where the issue list is shown; event names match metric names exactly; `engine_version` metadata on every event; `flushEvents()` after conversions and on `pagehide`
- [ ] **Determinism:** nothing in `lib/doctor/` uses React, Flagsmith, `Date`, `Math.random`, network, storage or env; issues stay sorted; patches are templates
- [ ] **Rules (if a rule changed):** broken fires, fixed is silent, patch round-trip passes, confidence is right, corpus still clean, `npm run real-world` shows no new parse errors or certain issues, `ENGINE_VERSION` bumped
- [ ] **Privacy:** pasted code is never sent anywhere; no secrets or `.env` files; `FLAGSMITH_ADMIN_TOKEN` stays server-only
- [ ] **Experiment:** no change to the flag, variations, metrics or rollout while an experiment is running; agent/simulated traffic never touches Production
