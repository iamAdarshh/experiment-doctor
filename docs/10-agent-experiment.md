# Agent experiment (primary scored experiment, merged plan)

Merges Anmol's "Agent Experience A/B test" method with the Experiment Doctor product.
Question: **Does showing a ready-made patch, instead of an issue list with docs links, help a coding agent repair
a broken Flagsmith experiment setup more often?**

Simulated arrivals, real attempts: a script starts fresh agent sessions; the agent chooses its own actions; an
independent checker grades the result. Every session that receives doctor output is an exposure; only a verified
repair is a conversion. Track 1 allows simulated traffic.

## Design
| Item | Value |
| --- | --- |
| Environment | `Agents` (never Production) |
| Flag | `fix_presentation` (same as humans): control `issues`, variation key `patch` |
| Identity | `agent-<runId>`, one fresh session per attempt, reused for the whole session |
| Exposure | when the runner first returns doctor output to the agent (`getExperimentFlag` in the Node harness) |
| Primary metric | `agent_repair_verified`, occurrence, increase |
| Diagnostics (not deciding) | tool calls, rescans, tokens, wall time, failure reason (in the run log) |
| Model | one pinned model version and settings for all runs |
| Budget | same max steps / tokens per run for both arms; timeouts stay in the denominator |

## Tasks (from doctor rule fixtures, scored set kept separate from docs examples)
Each task is a small broken Flagsmith project (JS or Node). Difficulty tiers:
1. One bug (e.g. `enableEvents` missing).
2. Two bugs (e.g. event name case mismatch + no flush).
3. Three bugs including one needing CLI output (variation without key, via provided `flag.json`).
Use different flag names, metric names and identities from any example shown in the doctor output.

## Agent tools
- read/write files in its own empty workspace copy of the task
- `doctor` tool: runs `runChecks` on the workspace and returns output in the arm's format
- `finish`
No internet, no Flagsmith docs access (the doctor output is the only help), identical prompt for both arms.

## Independent checker (outside the agent workspace)
Runs the repaired project against a **mock Flagsmith server** (local HTTP server answering the flags endpoint and
recording `v1/events` posts) and passes only if, for the task's identity:
1. identify happens, 2. an exposure for the experiment flag is recorded, 3. the conversion event arrives with the
exact metric name, 4. events are flushed before exit, 5. the project still runs (no crash).
It does **not** reuse doctor rules, so grading isn't circular.

## Stages
| Stage | Runs | Purpose |
| --- | --- | --- |
| Instrumentation check | 1 scripted pass + 1 scripted fail (Development) | Both exposures arrive, only the pass converts, re-reads keep the arm |
| Pilot | 12 real sessions (Development) | Find ambiguous tasks, ceiling effects (everyone passes), cost and time per run |
| Scored | target 180 (60 per tier, shuffled), Agents env | Freeze tasks, prompt, model, checker, run count before starting |
Final count = affordable count from pilot cost x runs. 180 runs gives about 90 per arm, which detects roughly a
20-point gap; if the pilot shows both arms near 100%, make tasks harder before scoring.

## Reporting
Successes / exposures per arm, difference in points, Flagsmith credible interval and chance to beat control,
SRM status, task mix per arm. Reconcile run-log totals with refreshed Flagsmith results. Infra errors logged
separately. If the interval spans zero, say inconclusive. Scope the conclusion to these tasks and this model.

## Build plan
| Day (IST) | Adarsh | Anmol |
| --- | --- | --- |
| Nov 26 | Engine + checks 1-5 (they double as task generators); doctor CLI/tool wrapper | Flagsmith envs incl. `Agents`; mock Flagsmith server + checker; one task end to end |
| Nov 27 | Website arms for humans; determinism tests | Runner, pilot (12), cost estimate, freeze, start scored runs |
| Nov 28 | Results page, README technical sections | Finish runs, reconcile counts, pick real traces for the video |
| Nov 29 | Read both experiments at 12 PM IST, roll out winner | Video; submit by 6 PM IST (deadline 8 PM IST = 15:30 Berlin) |

Needs: an LLM API key and a small budget (scripts env only). The doctor itself stays LLM-free and deterministic.
