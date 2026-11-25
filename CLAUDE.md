# Experiment Doctor: Claude Code project guide

## What this is
A free web tool for **Toggle Wars** (WeMakeDevs x Flagsmith hackathon, Track 01 "Test Something Real").
Other hackathon teams paste their Flagsmith code (and optionally a dependency file, their metric names, and
`flagsmith feature get --json` output). The tool lists the setup bugs that make Flagsmith Experimentation
events disappear silently, and offers fixes.

The tool is A/B tested with Flagsmith Experimentation in **two experiments** (decided 25 Nov):
1. **Primary, AI coding agents** (`Agents` environment): scripted fresh agent sessions repair broken Flagsmith
   projects using only the doctor's output; an independent checker (mock Flagsmith server) verifies the repair.
   Metric `agent_repair_verified`. Spec: `docs/10-agent-experiment.md`.
2. **Secondary, real humans** on the website (`Production` environment), the impact story. Details below.

Both use the same flag:
- Flag `fix_presentation`: control value `issues` (an issue list with docs links); variation key `patch`
  (a ready-made fix with a copy-patch button).
- Primary metric `rescan_clean` (occurrence, increase). Guardrail `minutes_to_clean` (mean, should not
  increase). Secondary `rescan_count` (count). `patch_copied` is logged but is not an experiment metric,
  because only the variant can fire it.

Team of two, splitting the work by area: Adarsh leads the doctor engine, rules, doctor CLI/tool wrapper and
Flagsmith client code; Anmol leads Flagsmith org setup, the mock Flagsmith server + checker, the agent runner,
UI components, outreach and the video. Each reviews the other's PRs.

Deadline: **8:00 PM IST, Sun 29 Nov 2026**. No late submissions. Submit a public repo, a README (setup
steps + how Flagsmith is used), and a short demo video.

## Read these first
- `docs/03-setup-plan.md`: the full plan (stack, accounts, architecture, repo layout, schedule)
- `docs/04-flagsmith-experimentation-reference.md`: verified SDK and API facts. **Use these names exactly.**
- `docs/06-doctor-rules-spec.md`: the 11 checks the doctor runs
- `docs/07-determinism.md`: the non-negotiable output rules
- `docs/05-experiment-design.md`: pre-registered hypothesis and stopping rule for the human experiment (don't change it after launch)
- `docs/10-agent-experiment.md`: the primary agent experiment (tasks, checker, pilot, scored runs)

## How to work with us (important)
Both of us must be able to explain every line. Judges disqualify teams that can't explain their own code.
- Prefer small, reviewable diffs. Explain *why* for each change, in plain words, before or with the code.
- Don't generate large files or whole features in one go unless asked. Propose the structure first.
- No clever one-liners or unexplained abstractions. Readable over terse.
- When you introduce a library API, name the doc it comes from.
- If asked to "just do it", still end with a short "what to know about this code" note.
- Hackathon times are IST (UTC+5:30). Adarsh is on Europe/Berlin time.

## Stack (pinned)
- Next.js 15 App Router + TypeScript (strict), Tailwind CSS + shadcn/ui, Shiki, `diff`
- `@flagsmith/flagsmith` >= 12.4.0 (experiment events need 12.4.0+), React bindings from `@flagsmith/flagsmith/react`
- `@babel/parser` for JS/TS analysis; regex helpers for Python, Go, Java and dependency files
- Vitest + `fast-check`; GitHub Actions CI; Vercel Hobby hosting
- **No LLM** anywhere in the doctor's result path. No database. No auth.
- The agent runner (`scripts/agents/`) is the only place an LLM API key is used; it never ships to the website.
- Exact versions in `package.json` (no `^`/`~`), committed lockfile.

## Architecture rules
- `lib/doctor/` is a pure engine: **no React, no Flagsmith, no `Date`, no `Math.random`, no network, no
  `localStorage`**. Signature: `runChecks(input: DoctorInput): DoctorResult`.
- Pasted code never leaves the browser. Never send code, file contents or rule hits to any server or analytics.
- Flagsmith calls live only in `lib/experiment.ts` and `components/FlagsmithProvider.tsx`.
- `FLAGSMITH_ADMIN_TOKEN` is server-only (`app/api/results/route.ts`, `scripts/`). Never `NEXT_PUBLIC_`.
- Exposure: call `getExperimentFlag('fix_presentation')` only when the first issue list renders (visitors
  with a clean first scan are never enrolled).
- Every event carries `metadata: { engine_version: ENGINE_VERSION }`.
- Call `flushEvents()` after conversion events and on `pagehide`.

## Commands
```bash
npm run dev          # local app
npm test             # vitest (all)
npx vitest run tests/rules/<rule>.test.ts   # one rule
npm run lint && npm run typecheck
npm run doctor:self  # run the doctor on our own source (CI does this too)
```
When a test run fails, re-run only the failing tests while fixing.

## Definition of done for any change
1. Tests pass, including determinism and patch round-trip tests (`docs/07-determinism.md`).
2. `REVIEW.md` checklist is satisfied.
3. Both of us can explain it (use the `explain-my-code` skill if unsure).

## Environment variables
See `.env.example`. Never commit `.env*` files other than `.env.example`.

## Don'ts
- Don't change the rollout, flag variations or metrics while the Production experiment is running.
- Don't mix agent or simulated traffic into Production. Agents run only in `Agents`, simulation only in `Simulation`.
- Don't change tasks, prompt, model, budget or checker after the agent pilot is frozen.
- Don't use the Flagsmith MCP server to start experiments (it can't); use the CLI/Admin API (see reference doc).
- Don't read results before 12:00 PM IST, 29 Nov, to make a decision (stopping rule).
