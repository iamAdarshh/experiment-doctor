---
name: agent-runs
description: Build and operate the AI-agent experiment (mock Flagsmith checker, runner, instrumentation check, pilot, freeze, scored runs, reconciliation). Use for anything in scripts/agents or the Agents environment.
---

# Agent runs

Spec: docs/10-agent-experiment.md. Environment: `Agents` only. LLM key lives only in the scripts env.

## Build order
1. **Mock Flagsmith server** (`scripts/agents/mock-flagsmith.ts`): answers the flags/identities endpoint and records
   every `v1/events` POST with identity, event name, timestamp. No dependency on doctor code.
2. **Checker** (`scripts/agents/check.ts`): runs the repaired project against the mock with a timeout and returns
   `{ pass, reasons[] }`: identify seen, exposure for the flag, conversion with the exact metric name, flushed
   before exit, no crash. Unit-test it on fixture `broken` (fail) and `fixed` (pass) first.
3. **Doctor tool**: the agent's only help; calls `runChecks` and formats output per arm (`issues` or `patch`).
4. **Runner** (`scripts/agents/run.ts`): for each job, new `runId`, empty workspace copy, Flagsmith Node SDK with
   `enableEvents`, assignment for `agent-<runId>`, exposure when doctor output is first returned, pinned model,
   fixed step/token budget, then checker; on pass send `agent_repair_verified`; always append a run-log line
   (task, arm, steps, tokens, seconds, outcome, reason); close/flush the SDK before exit.

## Stages (stop and report to the team between each)
1. Instrumentation check: one scripted pass, one scripted fail in Development. Both exposures, one conversion.
2. Pilot: 12 sessions in Development. Report pass rate per arm and tier, cost and time per run, ambiguous tasks,
   ceiling effects. Propose fixes.
3. Freeze: commit tasks, prompt, model id, budget, checker version, run count to docs/10 decision log.
4. Scored: run in shuffled order in `Agents`. Log infra errors separately; never retry a session that failed on
   the agent's own merits.
5. Reconcile: run-log totals per arm vs refreshed Flagsmith results (exposures, conversions). Report any gap.

## Never
- Change anything frozen after scored runs start.
- Give the agent internet or Flagsmith docs access.
- Count infra failures as agent failures, or drop timeouts from the denominator.
