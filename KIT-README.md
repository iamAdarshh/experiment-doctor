# Experiment Doctor: Claude Code starter kit (KIT-README.md)

Everything discussed for Toggle Wars (Track 01), packed for Claude Code.

## How to use
1. Create your empty public repo (e.g. `experiment-doctor`) and clone it.
2. Unzip this kit into the repo root, so `CLAUDE.md`, `REVIEW.md`, `docs/` and `.claude/` sit at the top level.
3. `cp .env.example .env.local` and fill in keys (never commit it).
4. Run `claude` in the repo. Claude Code reads `CLAUDE.md` automatically, and the skills in `.claude/skills/`
   become available (ask for them by name, e.g. "use add-doctor-rule for event-metric-mismatch").
5. Suggested first prompt: "Read CLAUDE.md and docs/03-setup-plan.md. Propose the scaffold for tonight's step,
   explain each file before writing it, and keep diffs small."

## What's inside
| Path | What |
| --- | --- |
| `CLAUDE.md` | Project guide Claude Code loads every session: goal, stack, rules, how to work with us |
| `REVIEW.md` | PR review checklist (Flagsmith correctness, determinism, rules, privacy, clarity) |
| `.env.example` | Environment variables |
| `.claude/settings.json` | Safe permission allowlist (tests, lint, git read, Flagsmith read); blocks reading `.env` files |
| `docs/01-hackathon-rules.md` | Rules, dates, tracks, judging, disqualifiers |
| `docs/02-strategy.md` | Competition analysis and why Experiment Doctor |
| `docs/03-setup-plan.md` | Stack, accounts, architecture, repo layout, day-by-day split, deploy, risks |
| `docs/04-flagsmith-experimentation-reference.md` | Verified SDK/API/CLI facts and gotchas |
| `docs/05-experiment-design.md` | Pre-registration: hypothesis, metrics, stopping rule, decision log |
| `docs/06-doctor-rules-spec.md` | The 11 checks, input/output types, rule contract |
| `docs/07-determinism.md` | Determinism and reliability rules and tests |
| `docs/08-outreach-and-demo.md` | Where to post, launch post, video plan |
| `docs/09-traffic-risk.md` | Honest sample-size math and the traffic plan (humans, AI agents, simulation) |
| `docs/10-agent-experiment.md` | **Primary experiment**: AI agents repair broken Flagsmith projects; independent checker, pilot, 180 scored runs |
| `.claude/skills/agent-runs` | Instrumentation check, pilot, freeze and scored agent runs with reconciliation |
| `.claude/skills/add-doctor-rule` | Fixture-first workflow for a new check |
| `.claude/skills/flagsmith-experiment-ops` | Set up, launch, monitor, read and end the experiment |
| `.claude/skills/determinism-check` | Audit the engine for nondeterminism and run the tests |
| `.claude/skills/explain-my-code` | Judge-style walkthrough and quiz so you can explain everything |
| `.claude/skills/submission-check` | Final checklist against the rules and judging criteria |

Live docs: setup https://claude.ai/artifact/5MpChw2oaTfdQ1kL7x6Wah · rules https://claude.ai/artifact/DGVyVyQaxBrFXfyYjhAx5z · strategy https://claude.ai/artifact/7J445nQ9Yjr9tbXfsS7sfe
