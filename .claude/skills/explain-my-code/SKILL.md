---
name: explain-my-code
description: Coach a teammate to explain a file, function or the whole system in their own words, as a judge would ask. Use when asked to explain code, prepare for judges, or before merging code Claude wrote.
---

# Explain my code

Judges can disqualify teams that can't explain their own code. The goal is the teammate's understanding, not a summary.

1. Ask which scope: a file, a rule, the Flagsmith flow, or the whole system (default: what changed in the last PR).
2. Give a **plain-words walkthrough** in at most 10 bullets: inputs, what happens step by step, outputs, and why
   each design choice was made (link the doc in docs/ that decided it).
3. Point out the **2-3 lines most likely to be questioned** and why they are written that way.
4. Then **quiz**: ask 3 judge-style questions one at a time, for example:
   - "What happens if a team pastes code with no metric names?"
   - "Why is exposure recorded only when the issue list renders?"
   - "How do you know the same input always gives the same result?"
   - "What does Flagsmith actually receive from a visitor?"
   Wait for the answer, then correct or confirm briefly.
5. End with anything they couldn't answer, as a short list to re-read.
Don't write new code in this skill.
