# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary: developers in the Toggle Wars hackathon (WeMakeDevs x Flagsmith, 25 to 29 Nov 2026)** who have wired
  Flagsmith Experimentation into their own project and need to know why events are missing, usually under deadline
  pressure. They arrive from a link (Discord, X, Flagsmith community), paste code on a desktop browser, fix it in
  their own editor and come back to re-scan.
- **Judges and demo-video viewers:** must understand what the tool does and that it is itself an A/B test within
  seconds, from a 2 to 3 minute video or a quick skim of the live site.
- **Mobile visitors:** open the link on a phone from chat or social. Mostly read and understand; pasting code is rare
  there, but the page must still work.
- **Coding agents (agent experiment):** use the doctor through the CLI and `scripts/agents/doctor-tool.ts`, not the web
  page. The text output of `lib/doctor/format.ts` is their interface.

## Product Purpose
Flagsmith Experimentation drops bad events silently: a missing `enableEvents: true`, an event name in the wrong case,
or a variation with no key can wipe out an experiment with no error. Experiment Doctor reads a team's Flagsmith code
(plus optional dependency file, metric names and `flagsmith feature get --json` output) and lists the setup bugs that
lose events, each linked to the Flagsmith docs. Success: a visitor goes from a scan with issues to a clean re-scan.

The tool is itself A/B tested with Flagsmith Experimentation on the flag `fix_presentation`: control `issues` (an
issue list with docs links) versus variant `patch` (the same issues, each with a ready-made fix and a copy button).

## Positioning
The only checker for Flagsmith experiment setup, and its own users are the experiment: hackathon competitors are the
test population, and the results page shows the live experiment in the open. Deterministic, rule-based output with
no LLM in the result path; the same input always gives the same result ID.

## Operating Context
- Paste, scan, read issues, fix in their own editor, re-scan. Several files can be pasted in one box with
  `// @file path` markers.
- `/results` shows the pre-registered experiment design and live results from the Flagsmith Admin API.
- Hackathon deadline: 8:00 PM IST, 29 Nov 2026. Submission needs a public repo, README and demo video.

## Capabilities and Constraints
- 11 checks (`lib/doctor/rules/`), each **certain** or **possible**; only certain issues block a clean result.
  Checks that need an empty input box are reported as "not checked", so a clean result is never a false all-clear.
- **Privacy:** pasted code never leaves the browser. Flagsmith only receives a random visitor ID, the flag read and
  the experiment events. The UI must say this plainly and must never send code, file contents or issues anywhere.
- **Experiment integrity:**
  - The two arms must stay identical except for one difference, per the pre-registration ("a ready-made fix
    instead of a diagnosis with docs links"): where an issue has a fix, the variant shows the fix (patch plus copy
    button) in place of the docs link. Issues without a fix show the same docs link in both arms.
  - The exposure is recorded only when the first issue list renders. Visitors with a clean first scan are never
    enrolled.
  - The UI refactor ships before the Production experiment launches (evening IST, 26 Nov 2026).
  - After launch the UI is frozen, except for bug fixes that affect both arms equally.
- Next.js 15 App Router, React 19, Tailwind CSS 4, hosted on Vercel. No database, no auth, no LLM in the result path.
- UI work: Adarsh builds it, Anmol reviews.
- **Open decision (variant):** "Copy fix" copies only the replacement text (the "With" side). Copying the whole
  corrected block instead may be better. Revisit only if there is time **before** the Production launch: it changes
  the variant arm, so it is frozen once the experiment runs.

## Brand Commitments
- Name: **Experiment Doctor**, described as a tool *for* Flagsmith. It must not look like an official Flagsmith
  product or use Flagsmith's branding as its own.
- Voice: plain, direct, technical; states what will break and why, without hype.

## Evidence on Hand
- A broken example built into the page (`lib/example.ts`) that triggers 4 issues.
- The rule specification (`docs/06-doctor-rules-spec.md`) and fixtures per rule (`lib/doctor/fixtures/`).
- No users, testimonials or results yet. Experiment numbers come only from the live Flagsmith experiment. Never
  fabricate them.

## Product Principles
1. **Never a false all-clear.** What was not checked is as visible as what was found.
2. **The fix is the destination.** Every screen moves the visitor toward a clean re-scan.
3. **Trust through openness:** local-only analysis, deterministic output, and an experiment shown in public.
4. **Fair experiment first.** Visual changes must not favour one arm.

## Accessibility & Inclusion
- Designed for accessibility, usability and clear structure: keyboard-operable throughout, clear content hierarchy
  and navigation, readable code and issue text, and status that does not depend on colour alone.
- Motion and interaction feedback should help people understand what happened, and must respect
  `prefers-reduced-motion`.
- Target: WCAG 2.2 AA.
