# Experiment Doctor: setup and tech stack

As of 25 Nov 2026. Live doc: https://claude.ai/artifact/5MpChw2oaTfdQ1kL7x6Wah

Build a Next.js app on Vercel where a team pastes its Flagsmith code and gets a list of setup bugs, with all
analysis in the browser and no LLM. Flagsmith Experimentation decides how bugs are shown: a plain issue list
with docs links (control) or a ready-made fix with a copy button (variant `patch`), judged on `rescan_clean`.

**Update 25 Nov (merged plan):** the primary scored experiment uses AI coding agents as users, with an independent
checker (docs/10-agent-experiment.md). The website experiment with real humans is secondary. The day-by-day table
in docs/10 replaces the one below where they differ.

Before kickoff (8 AM IST, Nov 26; head start allowed):
1. Turn on the Flagsmith managed warehouse in Development and Production (first events can take hours).
2. Send one exposure and one `trackEvent` from a throwaway page; confirm both arrive.
3. Confirm Experimentation (beta) is available on your Flagsmith plan.

## Tech stack
| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript | One repo for tool page, public results page, one server route; zero-config Vercel. |
| Flagsmith client | `@flagsmith/flagsmith` >= 12.4.0 + React bindings | 12.4.0 is the minimum that sends experiment events (`getExperimentFlag`, `trackEvent`, `trackExposureEvent`, `flushEvents`). |
| Analysis engine | Plain TS rules + `@babel/parser` (JS/TS), regex (Python, Go, deps) | Runs in the browser; pasted code never leaves the machine. |
| LLM | None | Same input must give same output, else `rescan_clean` measures noise. Free, no key to leak. |
| UI | Tailwind + shadcn/ui, Shiki, `diff` | Looks good on video quickly. |
| Tests | Vitest + fast-check; broken/fixed fixture per rule | False positives hurt real teams and the experiment. |
| Hosting | Vercel Hobby | Preview URL per PR. |
| Flagsmith setup | CLI v2 + Admin API script | Setup is code in the repo; judges can repeat it. |
| CI | GitHub Actions | Tests + doctor runs on its own source. |
Not needed: database, auth, paid services.

## Accounts and keys
| Item | Who | Where | Notes |
| --- | --- | --- | --- |
| Public GitHub repo, Anmol as collaborator | Adarsh's GitHub account | | Star `Flagsmith/flagsmith` for the AirPods draw. |
| Vercel linked to repo | Adarsh | | Hobby is free. |
| Flagsmith Cloud org, both invited | Anmol creates, invites Adarsh | | Project `experiment-doctor`; envs Development, Production, Simulation (+ Agents if Plan B). |
| Managed warehouse | Anmol | Environment Settings > Warehouse > Flagsmith > Enable | Own warehouse needs Scale-Up. |
| Client env key per env | | `NEXT_PUBLIC_FLAGSMITH_ENV_ID` | Public by design. |
| Admin API token | Anmol, shared privately | `FLAGSMITH_ADMIN_TOKEN` (server/.env only) | Never commit, never `NEXT_PUBLIC_`. |
| Experiment ID | after launch | `FLAGSMITH_EXPERIMENT_ID` | For the results page. |
| Flagsmith CLI v2 | both | `curl -fsSL https://get.flagsmith.com \| sh` | `flagsmith login`. |
| Discord accounts | both | Flagsmith + WeMakeDevs | Ask a mod before posting. |
| LLM API key (only if Plan B agents run) | Anmol | `scripts/` env only | See 09-traffic-risk.md. |
| Screen recorder | Anmol | | OBS or Loom. |

## Architecture
```
Browser
  Paste box -> Doctor engine (lib/doctor, pure, local) -> Results panel (IssueList | PatchList)
  Flagsmith JS SDK: identify, getExperimentFlag (exposure), trackEvent (conversions)
        |  flags                    |  events (batched 10 s)
        v                           v
Flagsmith Cloud: Edge API      Event ingestion -> Managed warehouse -> Experiment results (Bayesian)
                                                                          |
Vercel (Next.js): /api/results (server only, admin token, 5 min cache) <--+
                  /results page (public "experiment in the open")
```
Flagsmith only sees the random visitor id, the flag read and events. The server route exists so the admin token never reaches the browser.

## Repo structure
`lib/doctor/` has no React or Flagsmith imports. Adarsh leads `lib/` and repo setup; Anmol leads `components/` and `app/`, built against the `Issue` type, so both can work in parallel.
```
experiment-doctor/
  app/
    page.tsx                 # paste box, scan button, results panel
    results/page.tsx         # public "experiment in the open" page
    api/results/route.ts     # server only: reads Flagsmith results with the admin token
  components/
    CodeInput.tsx            # code + optional deps, metric names, flag JSON
    IssueList.tsx            # control
    PatchList.tsx            # variant: diff + copy button
    FlagsmithProvider.tsx    # init, identify, enableEvents
  lib/
    experiment.ts            # getExperimentFlag, trackEvent wrappers, flushEvents on pagehide
    identity.ts              # random visitor id in localStorage
    doctor/
      index.ts               # runChecks(input) -> DoctorResult
      types.ts
      parse.ts
      rules/                 # one file per rule
      fixtures/<rule>/       # broken, fixed, expected.json
  tests/
  scripts/
    setup-flagsmith.sh       # CLI: flag + variation
    create-experiment.ts     # Admin API: metrics + experiment (not started)
    simulate.ts              # labelled fake traffic, Simulation env only
    agent-run.ts             # Plan B: AI agents as users, Agents env only
  docs/                      # this kit
  .github/workflows/ci.yml
  README.md
```

## Flagsmith experiment setup
See 05-experiment-design.md (pre-registration) and 04-flagsmith-experimentation-reference.md (API facts).
Steps:
1. Enable the managed warehouse in Development and Production; wait for Connected.
2. `flagsmith init --project experiment-doctor --environment <key>`;
   `flagsmith feature create fix_presentation --value issues --enabled`;
   `flagsmith feature variant add fix_presentation --value patch --key patch --weight 0`.
3. Create metrics `rescan_clean` (occurrence, up), `minutes_to_clean` (mean), `rescan_count` (count).
4. Test end to end in Development until both arms show exposures and conversions.
5. Production: Experiments > Create Experiment: 100% rollout, split evenly, primary `rescan_clean` (increase).
   The wizard starts immediately, so only when the site is live.
6. Save the experiment ID to `FLAGSMITH_EXPERIMENT_ID`. Don't change rollout while running.
7. End: end the experiment (frozen, can't restart), then make the winner the flag default.

Client code, short:
```ts
await flagsmith.init({ environmentID: process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID!, enableEvents: true });
await flagsmith.identify(getVisitorId());
const arm = flagsmith.getExperimentFlag('fix_presentation')?.value; // when first issue list renders
flagsmith.trackEvent('rescan_clean', { metadata: { engine_version: ENGINE_VERSION } });
flagsmith.trackEvent('minutes_to_clean', { value: minutesSinceFirstScan, metadata: { engine_version: ENGINE_VERSION } });
await flagsmith.flushEvents();
```
(Check the exact `metadata` option shape in the run-an-experiment docs.)

## Who does what (IST)
Work is split by area. Adarsh leads the engine, rules and Flagsmith client code. Anmol leads Flagsmith setup, the UI,
outreach, the agent checker and runner, and the video. Each reviews the other's PRs, and both should be able to explain all of it.

| When | Adarsh | Anmol | Done when |
| --- | --- | --- | --- |
| Tonight, before 8 AM Nov 26 | Create repo, scaffold Next.js/Tailwind/Vitest, link Vercel, deploy blank page, protect `main`. | Flagsmith org/project/envs, invite Adarsh, managed warehouse, test exposure + event, confirm Experimentation access. | Blank site live; test event visible |
| Nov 26 | `types.ts`, `parse.ts`, `runChecks`, checks 1-5 with fixtures/tests; `lib/experiment.ts`, `identity.ts`. | `setup-flagsmith.sh`, metrics; `IssueList`/`PatchList`; test both arms in Development. Start outreach (09-traffic-risk.md). | Evening: Production experiment live, posts out |
| Nov 27 | Checks 6-8, determinism + round-trip tests, `/api/results`, doctor CLI wrapper. | Results page UI; watch for skipped events; outreach; start agent harness if checkpoint missed. | 25+ enrolled per arm (or Plan B started) |
| Nov 28 | Checks 9-11, false-positive corpus, CI self-check, README technical sections. | 12 PM traffic check; Plan B/C per 09-traffic-risk.md; UI polish; video script. | All checks shipped; README drafted |
| Nov 29 | 12 PM read results together, end experiment, roll out winner; finish README; code freeze 3 PM. | 1-4 PM record/edit video. | Submitted by 6 PM (deadline 8 PM) |

## Deployment
Vercel: `main` -> production, PRs -> previews. Previews use the Development key.
Production env: `NEXT_PUBLIC_FLAGSMITH_ENV_ID` (Production key), `FLAGSMITH_ADMIN_TOKEN`, `FLAGSMITH_EXPERIMENT_ID`.
Protect `main` (PRs only, CI required). `/api/results` caches 5 minutes (matches the API refresh limit).
Smoke test after each deploy: paste a broken fixture, check both arms by clearing `localStorage`, confirm events in Flagsmith.

## Risks
| Risk | Fallback |
| --- | --- |
| **Not enough traffic** (Flagsmith Discord about 50 members) | See 09-traffic-risk.md: widen audience, AI-agent population, labelled simulation last. |
| Experimentation not on your plan | Ask in Flagsmith Discord tonight (beta). |
| Warehouse slow on first events | Enable tonight; don't launch until Development shows results. |
| False positives | Fixtures, `possible` labels, "this is wrong" button. |
| Wizard starts immediately | Create only after Production site is live and tested. |
| Pasted secrets | All analysis in the browser; say so above the paste box. |
| Seen as spam | Ask mods first. |

Open questions: Experimentation free on Cloud? How to attach guardrails in the wizard? Built-in "roll out winner"? Warehouse latency?
Guesses: traffic numbers, +15 point lift, 30% baseline, agent run cost, video timings.
