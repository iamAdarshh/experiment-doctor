# Experiment Doctor for Flagsmith

Flagsmith Experimentation loses events silently: the SDKs skip a bad event instead of throwing. A missing
`enableEvents: true`, an event name with the wrong case, or a variation without a key can each wipe out an
experiment, and nothing tells you. **Experiment Doctor** reads your Flagsmith code and finds those setup bugs
before they cost you your results. It runs entirely in your browser: pasted code never leaves your machine.

Built for **Toggle Wars** (WeMakeDevs x Flagsmith), Track 01 "Test Something Real". The tool itself is
A/B tested with Flagsmith Experimentation (see [How we use Flagsmith](#how-we-use-flagsmith)).

- Live site: https://experiment-doctor.vercel.app
- Demo video: _TODO_
- Public results page: https://experiment-doctor.vercel.app/results

## What it checks

Paste code (required), plus optionally a dependency file, your metric names and the output of
`flagsmith feature get <flag> --json`. Each check is a failure described in the Flagsmith docs.
Checks that need a box you left empty are listed as **not checked**, so a clean result is never a false all-clear.

| # | Check | What it catches | Confidence |
| --- | --- | --- | --- |
| 1 | `events-disabled` | Experiment calls without `enableEvents: true` (they become no-ops) | certain |
| 2 | `event-metric-mismatch` | `trackEvent('X')` where X matches no metric name (case-sensitive); suggests the closest | certain |
| 3 | `variation-key` | A variation with no key (not counted), or keyed `control` (reserved) | certain |
| 4 | `no-flush` | Events never flushed (batched every 10 s, lost on exit) | certain for scripts, possible otherwise |
| 5 | `sdk-too-old` | SDKs below the minimum for events (JS 12.4.0, Node 9.1.0, Python 6.3.0, Go v5.3.0, Java 8.2.0) | certain / possible for ranges |
| 6 | `no-exposure` | The experiment flag read with `getValue` / `getAllFlags` / `useFlags`, so no exposure is recorded | possible |
| 7 | `no-identity` | Experiment calls with no `identify()` (unidentified users are skipped) | certain / possible |
| 8 | `identity-mismatch` | An exposure and a conversion in the same function use different identity expressions | possible |
| 9 | `conversion-before-exposure` | `trackEvent` before the flag read in the same function | possible |
| 10 | `selfhosted-events-url` | `eventsApiUrl` ending in `/v1/events`, or a self-hosted API with no events URL | certain |
| 11 | `analytics-vs-events` | `enableAnalytics` mistaken for events; `eventProcessorConfig` without `enableEvents` (init throws) | certain |

Only **certain** issues block a clean result. Code checks read JavaScript and TypeScript (with a real parser,
including several pasted files, flag and event names kept in constants, and the SDK loaded from a `<script>` tag);
dependency checks also read `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml` and `build.gradle`.

## How we use Flagsmith

We run **two experiments on one flag**, `fix_presentation`:

| Arm | Flag value | What the visitor (or agent) sees |
| --- | --- | --- |
| Control | `issues` | An issue list with links to the Flagsmith docs |
| Variant | key `patch` | The same issues; where an issue has a fix, a ready-made fix and a copy button replace the docs link, plus "Copy all fixed code" when there are two or more code fixes |

**Question:** does a ready-made fix, instead of a diagnosis, help people (and coding agents) reach a clean setup more often?

1. **Agents (primary, `Agents` environment):** scripted fresh coding-agent sessions repair broken Flagsmith
   projects using only the doctor's output; an independent checker running a mock Flagsmith server verifies
   each repair. Metric `agent_repair_verified`. Spec: [docs/10-agent-experiment.md](docs/10-agent-experiment.md).
2. **Humans (secondary, `Production` environment):** real visitors to the site. Pre-registration:
   [docs/05-experiment-design.md](docs/05-experiment-design.md).

Human experiment metrics:

| Metric | Event | Aggregation | Role |
| --- | --- | --- | --- |
| `rescan_clean` | a scan with 0 certain issues after an earlier scan had at least 1 | occurrence, increase | primary |
| `minutes_to_clean` | minutes since the visit's first scan, sent with `rescan_clean` | mean, should not increase | guardrail |
| `rescan_count` | every re-scan | count | secondary |

`patch_copied` is logged for the story but is not an experiment metric, because only the variant can fire it.

How the code uses the SDK (`@flagsmith/flagsmith` 12.6.0), all in [`lib/experiment.ts`](lib/experiment.ts):

```ts
await flagsmith.init({ environmentID, enableEvents: true });
await flagsmith.identify(visitorId);                        // random UUID kept in localStorage
const arm = flagsmith.getExperimentFlag('fix_presentation'); // exposure: only when the first issue list renders
flagsmith.trackEvent('rescan_clean', { metadata: { engine_version } });
flagsmith.trackEvent('minutes_to_clean', { value: minutes, metadata: { engine_version } });
await flagsmith.flushEvents();                              // after conversions and on pagehide
```

- Visitors whose first scan is clean are never enrolled, so they don't dilute the experiment.
- The exposure is recorded before any conversion event (conversions only count after the first exposure).
- Every event carries `engine_version`, so an engine change shows up in the data.
- Flagsmith only ever sees the random visitor ID, the flag read and these events: never pasted code or issues.
- The results page reads live numbers through a server route (`/api/results`) so the admin token stays on the server.

The doctor checks its own Flagsmith code in CI (`npm run doctor:self`).

## Setup

Requirements: Node.js 20+ (CI uses 22), npm.

```bash
git clone https://github.com/iamAdarshh/experiment-doctor.git
cd experiment-doctor
npm ci
cp .env.example .env.local   # fill in keys; never commit it
npm run dev                  # http://localhost:3000
```

Without `NEXT_PUBLIC_FLAGSMITH_ENV_ID` the site works but runs no experiment (everyone sees control).
Add `?arm=patch` to the URL to preview the variant locally; no events are sent then.

| Variable | Where | What |
| --- | --- | --- |
| `NEXT_PUBLIC_FLAGSMITH_ENV_ID` | browser | Client environment key (Development locally and on previews, Production on `main`) |
| `FLAGSMITH_ADMIN_TOKEN` | server only | Organisation API key, for the results page |
| `FLAGSMITH_ENV_KEY` | server only | Production environment key, for the Admin API |
| `FLAGSMITH_EXPERIMENT_ID` | server only | Set after the Production experiment is created |

Flagsmith side (flag, variation, metrics, experiment): see
[docs/03-setup-plan.md](docs/03-setup-plan.md#flagsmith-experiment-setup) and the `flagsmith-experiment-ops` skill.

### Commands

```bash
npm test                 # all tests
npm run lint && npm run typecheck
npm run doctor:self      # the doctor on our own Flagsmith code
npm run doctor -- <project folder> [--format issues|patch|json] [--metrics a,b] [--flag-json file]
npm run real-world      # the doctor on 91 real public projects (add -- --fetch for all 209)
npx tsx scripts/agents/doctor-tool.ts <workspace> <issues|patch>   # the agent experiment's tool
```

## How it works

```
Browser
  Paste boxes -> runChecks() in lib/doctor (pure, local) -> IssueCard list: docs link (control) | fix (variant)
  Flagsmith JS SDK: identify, getExperimentFlag (exposure), trackEvent (conversions)
Vercel (Next.js 15)
  /results page + /api/results -> Flagsmith Admin API (admin token, server only, 5 min cache)
```

| Path | What |
| --- | --- |
| `lib/doctor/` | The engine. `runChecks(input): DoctorResult`. No React, Flagsmith, clock, randomness, network or storage (enforced by lint). |
| `lib/doctor/parse.ts` | `@babel/parser` (TypeScript, JSX, decorators) turns code into a short list of facts: Flagsmith calls, SDK options, plain flag reads. Resolves top-level string constants and keeps each pasted file's clients apart. |
| `lib/doctor/rules/` | One file per check. Each returns issues, or says why it couldn't decide. |
| `lib/doctor/fixtures/<rule>/` | `broken.*` (one bug), `fixed.*`, `context.json`, reviewed `expected.json`. |
| `lib/doctor/format.ts` | Text output in the two arms' formats (CLI and agent tool). |
| `lib/scan-session.ts` | Pure rules for when experiment events fire (unit-tested). |
| `lib/experiment.ts` | All browser Flagsmith calls. |
| `lib/server/experiment-results.ts` | Admin API read for the results page (server only). |
| `lib/present.ts` | Headline wording, display order and file-aware locations for results (unit-tested). |
| `components/` | Input boxes, the shared `IssueCard` (the arms differ in its action slot), `IssueList`, `PatchList` (adds "Copy all fixed code"), the page logic. |
| `scripts/` | CLI, self-check, agent doctor tool, real-world run. |
| `tests/real-world/` | 209 public projects the doctor is run against ([README](tests/real-world/README.md), [report](tests/real-world/REPORT.md)). |

### Deterministic output

The same input always gives the same issues, in the same order, with the same patches
([docs/07-determinism.md](docs/07-determinism.md)). That matters for the experiment: if output varied between
scans, `rescan_clean` would partly measure noise.

- Input is normalized first (LF line endings, no BOM, no trailing spaces; metric names trimmed but not lowercased).
- Issues are sorted by rule order, line, column, message.
- Fixes are fixed templates filled with parsed values. **No LLM anywhere in the result path.**
- Exact dependency versions and a committed lockfile; the parser version is part of `ENGINE_VERSION`.
- Each result shows a result ID: SHA-256 of the normalized input plus `ENGINE_VERSION`.

### Tests (all run in CI)

- Per rule: the broken fixture gives exactly `expected.json`; the fixed fixture gives no issues.
- Patch round-trip: applying each fix makes that issue disappear on re-scan.
- Determinism: run twice, reordered boxes, CRLF, BOM and trailing spaces, plus `fast-check` properties
  (appended comments, unrelated code at the top, arbitrary text never throws).
- False-positive corpus (`tests/corpus/`): correct Flagsmith code must give zero issues.
- Real-world shapes (`tests/engine/real-world.test.ts`): code patterns from public projects that once broke the parser or a rule.
- Scan-session rules for enrolment and events.

**Tested on real code.** On 26 Nov we ran the doctor on 209 public projects: 77 with Flagsmith experiment code
(mostly other Toggle Wars teams), 110 production apps that use Flagsmith feature flags, and 22 of Flagsmith's own
examples. Every false positive and parse failure it found was fixed (engine 0.1.2), and an old SDK in an app that runs
no experiment is now a heads-up instead of a certain issue (engine 0.1.3). The files from repos whose licence
allows it are in [`tests/real-world/`](tests/real-world/); `npm run real-world` re-runs them.

## Privacy

All analysis runs in the browser. Pasted code, file contents and issues are never sent to any server or analytics.
Flagsmith receives a random visitor ID, the flag read and the experiment events above.

## Team

Adarsh (doctor engine, rules, CLI/agent tool, Flagsmith client code) and Anmol (Flagsmith org setup, mock
Flagsmith server and checker, agent runner, UI, outreach, video). Each reviews the other's PRs.

## License

[MIT](LICENSE). The third-party projects in [`tests/real-world/projects/`](tests/real-world/) keep their own licences,
in a `LICENSE` file next to each project's code.
