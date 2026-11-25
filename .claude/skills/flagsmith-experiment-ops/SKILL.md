---
name: flagsmith-experiment-ops
description: Set up, check, launch, monitor, read and end the fix_presentation Flagsmith experiment via the CLI and Admin API. Use for any Flagsmith flag, metric, warehouse, experiment or results task.
---

# Flagsmith experiment operations

Two experiments on the same flag `fix_presentation`: **Agents** environment (primary; metric
`agent_repair_verified`; spec docs/10-agent-experiment.md) and **Production** (humans; secondary).
Every step below applies per environment. Never send agent traffic to Production.

Source of truth: docs/04-flagsmith-experimentation-reference.md and docs/05-experiment-design.md.
Never print or commit `FLAGSMITH_ADMIN_TOKEN`. Ask before any step that changes Production.

## Set up (Development first, then Production)
1. Warehouse: confirm status is **Connected** in Environment Settings > Warehouse (human step in the dashboard).
2. Flag and variation:
   ```bash
   flagsmith init --project experiment-doctor --environment "$FLAGSMITH_ENV_KEY"
   flagsmith feature create fix_presentation --value issues --enabled
   flagsmith feature variant add fix_presentation --value patch --key patch --weight 0
   flagsmith feature get fix_presentation --json   # verify the variation has key "patch"
   ```
3. Metrics (Admin API, `scripts/create-experiment.ts`): `rescan_clean` occurrence/up, `minutes_to_clean` mean,
   `rescan_count` count. Event names must match exactly (case-sensitive).
4. Run the app against Development, scan as two identities (clear localStorage), and confirm exposures and
   conversions in both arms before touching Production.

## Pre-flight before launch (all must be yes)
- [ ] Production site live and smoke-tested
- [ ] docs/05-experiment-design.md sections 1-5 final and committed
- [ ] Flag JSON shows key `patch`, nothing keyed `control`
- [ ] Metrics exist in Production with exact names
- [ ] Example scans do not enroll
Then launch from the wizard (starts immediately) or create via API and `POST .../start/`.
Record the experiment ID and the launch time in the decision log.

## Monitor (do not decide)
- `POST .../experiments/<id>/results/refresh/` at most every 5 minutes, then `GET .../results/`.
- Report: identities per arm, conversions per arm, SRM warning, last computed time. Don't report win probability
  as a decision before 12:00 PM IST, Nov 29.
- If an arm has exposures but no conversions after real usage: check event names, `identify` before events,
  `flushEvents`, and `engine_version` metadata.

## Read and end (Nov 29, 12:00 PM IST)
1. Apply the stopping rule from docs/05-experiment-design.md exactly.
2. End the experiment (results freeze; can't restart).
3. Make the winning value the flag default; keep the flag for the demo.
4. Write the result, numbers and screenshot list into the decision log and README.

## Never
- Change rollout, variations or metrics while running.
- Send simulated or agent traffic to Production.
- Use the Flagsmith MCP server to start experiments (it can't).
