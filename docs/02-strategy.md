# Toggle Wars: competition analysis and strategy (summary)

As of 25 Nov 2026. Full doc: https://claude.ai/artifact/7J445nQ9Yjr9tbXfsS7sfe

## Decision
Adarsh and Anmol committed to **Track 01** with the **Experiment Doctor** ("the experiment where your
competitors are the users"). The earlier top pick, the Agent Experience A/B test, is the fallback.

## Why Experiment Doctor
Every Toggle Wars team will hit the same wall: Flagsmith events get dropped silently and the experiment shows
nothing. So build the free tool they all need, and run the A/B test on them.
- **Use of Flagsmith:** Flagsmith is both the subject of the tool and how it is tested.
- **Impact:** helps many real developers; fills a gap the docs admit (silent event rejection).
- **Creativity:** nobody else will have their competitors as test users.
- **Demo:** live numbers from real developers, not a simulator.
- **Main risk:** traffic. Mitigation: early outreach; labelled simulation in a separate env if short by midday Nov 28.

## Competition at a glance
| Track | Prize | Crowding (guess) |
| --- | --- | --- |
| 01 Test Something Real | $2,000 | High; expect many landing-page/signup tests |
| 02 AI Agents and Feature Flags | $1,000 | High |
| 03 Open Source Flagsmith | PS5 + GTA 6 | Medium |

## Patterns that seem to win (from past WeMakeDevs events: SigNoz, Cognee, 2fast2mcp, LingoHack25, OpenMetadata)
1. Deep, visible use of the sponsor's newest feature (here: Experimentation, in beta).
2. Proof instead of claims: measured result, live deployment, benchmark.
3. Filling a real gap in the sponsor's product.
4. A tight demo video.
5. Small teams can win (several solo winners).

## Flagsmith gaps worth knowing (from docs)
- No power/sample-size calculator, minimum duration, or auto-stop.
- No CUPED, no expected-loss metric ("not currently planned"); frequentist engine deferred.
- MCP server cannot end an experiment or roll out the winner.
- **Rejected events are silent; no lint for event names vs metric names.** (Experiment Doctor fills this.)
- Can't look up which variant an identity got.

## Winning playbook
1. Use the head start tonight: account, warehouse, one exposure + one conversion visible.
2. Confirm Experimentation access early (free on Cloud is unverified).
3. Start the experiment by day 2 at the latest (needs >= 50 identities and 5 conversions per arm).
4. Pre-register hypothesis, metrics, guardrails, stopping rule before launch.
5. Show stats honestly: credible interval, win probability, SRM check, what you'd do if inconclusive.
6. Demo video 2 to 3 min: problem, what you built, Flagsmith screen with live results, decision shipped.
7. README: setup in <= 5 commands, diagram of where Flagsmith sits, results with screenshots.

## Other ideas considered (backup)
- 1.1 Agent Experience A/B test (AI agents as users; metric `task_success`; guardrails `tokens_used`, `tool_errors`).
- 1.2 Prompt/model A/B test for a live AI feature.
- 1.3 Backend experiment judged by user outcomes.
- Track 02: Experiment Copilot that closes the loop; semantic flag janitor; self-defending rollouts.
- Track 03: experiment rigor pack (CUPED, expected loss); preview environments per PR; flags in editor + traces.
