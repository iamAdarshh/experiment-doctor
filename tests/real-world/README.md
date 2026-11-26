# Real-world projects

Real Flagsmith code the doctor is run against, to catch false positives and parse failures that hand-written
fixtures miss. Collected on 26 Nov 2026 from public GitHub repos. Results: [REPORT.md](REPORT.md).

```bash
npm run real-world             # the projects stored here
npm run real-world -- --fetch  # also downloads the manifest-only ones (see below) into .cache/, then runs all
```

## Groups

| Folder | What | Why |
| --- | --- | --- |
| `experiments/` | Code that calls the Flagsmith Experimentation API (mostly Toggle Wars teams) | Real bugs vs false alarms |
| `feature-flags/` | Production apps that use Flagsmith for feature flags, without experiments | The doctor must not cry wolf when no experiment runs |
| `flagsmith-examples/` | Flagsmith's own example apps (`flagsmith-js-examples`, demos) | Official code must read cleanly |

## What is stored, and licences

- [`sources.json`](sources.json) lists **every** project: repo, commit, licence, and the exact files used.
- For each project, only the files the doctor reads are kept: the source files that use Flagsmith, plus the
  `package.json` that lists the SDK. The teams' own tests and fixtures are left out.
- Files are stored under `projects/` **only when the repo's licence allows redistribution** (MIT, BSD, Apache-2.0,
  ISC, Unlicense). Each such project keeps its `LICENSE` file next to the copied code.
- Repos with no licence, a copyleft licence (GPL, AGPL) or an unclear one are listed in `sources.json`
  (`"included": false`) but not copied. `--fetch` downloads their files at the recorded commit into the
  git-ignored `.cache/` folder for a local run.

## How they were found

GitHub code search (`getExperimentFlag`, `flagsmith.trackEvent`, `enableEvents`, `@flagsmith/nodejs` ...) and
repo search (Flagsmith and Toggle Wars repos created or updated in Nov 2026). Each repo was cloned read-only;
nothing in it was run. The doctor only parses the code.

## Rules for this folder

- This is test **input**, not our code: it is excluded from TypeScript, ESLint, Vitest, Tailwind and GitHub's
  language stats.
- Don't edit the copied files. To refresh, re-collect and regenerate `REPORT.md` with `npm run real-world`.
- A shape that caught a bug gets its own small test in our own words (`tests/engine/real-world.test.ts`).
