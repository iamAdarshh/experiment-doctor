---
name: submission-check
description: Check the repo, README, video and experiment evidence against the Toggle Wars submission rules and judging criteria before submitting. Use on Nov 29 or whenever asked if we are ready to submit.
---

# Submission check (deadline 8:00 PM IST, 29 Nov 2026; aim for 6 PM)

Rules: docs/01-hackathon-rules.md. Report each item as done / missing, then the top 3 fixes.

## Required
- [ ] Repo is **public** on GitHub; default branch builds; no secrets in history (`git log -p | grep -i token` spot check).
- [ ] README has: what it is, **setup steps (5 commands or fewer)**, **how Flagsmith is used** (flag, variation,
      metrics, exposure/conversion code, experiment config, results), architecture diagram, results with screenshots.
- [ ] Short demo video exists, link in README.
- [ ] Every team member registered individually on WeMakeDevs.
- [ ] Submitted through the official method (check Discord for the link).

## Judging criteria
- [ ] **Use of Flagsmith:** Flagsmith visible in the first 30 seconds of the video; experiment config reproducible from `scripts/`.
- [ ] **Impact:** numbers: teams scanned, issues found, clean re-scans.
- [ ] **Creativity:** "competitors are the users" (and agents, if Plan B ran) stated up front.
- [ ] **Demo video:** problem, what we built, Flagsmith screens with results, the decision shipped.
- [ ] **Track 01:** hypothesis, versions behind a flag, metric from real events, explainable result (or honest "inconclusive").

## Honesty
- [ ] Simulated or agent data clearly labelled and never mixed with human results.
- [ ] Sample sizes per arm stated; SRM status stated.
- [ ] Both members can explain the code (run `explain-my-code`).

## Bonus
- [ ] Both starred github.com/Flagsmith/flagsmith (AirPods draw).
