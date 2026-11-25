# Traffic risk: getting a believable sample

**Status (25 Nov, 22:31 Berlin):** the Flagsmith Discord has only about 50 members, including admins and bots.
That alone can't produce a believable result. Plan for it now, not on Nov 28.

**Decision (25 Nov, 22:44 Berlin):** merged plan. AI coding agents are now the **primary** scored experiment
(docs/10-agent-experiment.md), which guarantees about 90 sessions per arm. Human traffic is the secondary
experiment and the impact story. Plan B below is therefore no longer a backup; the checkpoints apply to humans only.

## What sample size a believable result needs
Only visitors whose **first scan finds at least one issue** are enrolled, so count those, not page views.

| Situation | Enrolled visitors needed per arm | Total |
| --- | --- | --- |
| Flagsmith shows any verdict at all | 50 (and >= 5 `rescan_clean` per arm) | 100 |
| Detect a +30 point lift (30% -> 60% clean) | about 40 to 50 (so the 50 floor binds) | about 100 |
| Detect a +20 point lift (30% -> 50%) | about 90 | about 180 |
| Detect a +15 point lift (30% -> 45%) | about 160 | about 320 |

Rough numbers: two-proportion approximation, 80% power, 5% error rate. Flagsmith's Bayesian "> 95% chance
to beat control" behaves roughly like a one-sided test, so the real need is a bit lower, but the order of
magnitude holds. The 30% baseline is a guess.

**Honest read:** with human traffic only, we can likely detect only a very large effect, and only if we reach
100+ enrolled teams. A result below 50 per arm is not shown by Flagsmith at all. If we fall short, the README
must say "inconclusive, here is what we would need", which judges respect more than a cooked result.

## Plan A: widen the human audience (start Nov 26 morning)
The tool is useful to **anyone using Flagsmith Experimentation or OpenFeature**, not only hackathon teams.
1. **WeMakeDevs community:** the hackathon's own channels and the [WeMakeDevs Discord](https://discord.gg/wemakedevs)
   (much larger than the Flagsmith one; exact size not checked). Ask a mod for the right channel.
2. **Flagsmith team:** DM their devrel/mods. A free linter for their beta feature helps them too; ask if they'll
   share it on their X/LinkedIn or docs Discord.
3. **Evergreen post:** "11 ways your Flagsmith experiment silently loses events" on dev.to / Hashnode / LinkedIn,
   each mistake linking to the tool. Useful even without the tool, so it gets shared.
4. **X and LinkedIn:** 20-second clip, tag Flagsmith and WeMakeDevs.
5. **GitHub:** where people report "events not showing" in Flagsmith repos/discussions, help properly and mention
   the tool once. Never spam.
6. **Reddit** (r/webdev, r/reactjs, r/devops): only where self-promotion rules allow; lead with the article.
7. **Lower friction:** no signup, a "try a broken example" button. **Example scans must not enroll** in the
   experiment (they'd add fake data). Only pasted code enrolls.

## Plan B: AI coding agents as a second user population (recommended backup, build from Nov 27)
This merges the strategy doc's Agent Experience idea. Real LLM agents make real decisions, so it's not simulated traffic.
- Harness (`scripts/agent-run.ts`): each run gets one broken Flagsmith project from a fixture set, and the
  instruction "make this experiment record events correctly". Its only diagnostic tool is the doctor, wrapped as a
  CLI (`npm run doctor -- <path>`), which prints issues in **control** or **patch** format depending on the arm
  Flagsmith assigns to identity `agent-<runId>`.
- Same metrics: `rescan_clean`, `minutes_to_clean` (wall clock), `rescan_count`, plus `tokens_used` (mean,
  should not increase) as an agent-specific guardrail.
- Runs in a **separate `Agents` environment with its own experiment**. Never mixed with humans.
- Sample: hundreds of runs in an evening. Cost: a small, cheap model and capped steps; a guess of tens of dollars
  for about 400 runs. Needs an LLM API key (agent side only; the doctor itself stays LLM-free and deterministic).
- Story for judges: "Does fix-first output help humans *and* AI coding agents?" Two real populations, two experiments.

## Plan C: labelled simulation (last resort)
`scripts/simulate.ts` in the `Simulation` environment only, clearly labelled in README and video.
Useful to demo the pipeline, not as evidence.

## Checkpoints (IST)
| When | Check | If below | Action |
| --- | --- | --- | --- |
| Nov 26, 8 PM | Enrolled per arm | < 10 | Start Plan B harness work Nov 27 morning |
| Nov 27, 12 PM | Enrolled per arm | < 25 | Run Plan B experiment that evening |
| Nov 28, 12 PM | Both experiments | below the 50 floor | Add Plan C for the demo only, labelled |
| Nov 29, 12 PM | Read results | n/a | Stopping rule in 05-experiment-design.md |

Leads: Anmol for outreach and the agent harness script; Adarsh for the doctor CLI wrapper (it reuses `runChecks`).
