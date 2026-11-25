# Outreach and demo video

## Where to post
- Flagsmith Discord: https://discord.gg/hFhxNtXzgm (small, about 50 members on 25 Nov)
- WeMakeDevs Discord: https://discord.gg/wemakedevs (larger; ask a mod for the channel)
- X / LinkedIn (tag Flagsmith, WeMakeDevs), dev.to article. See 09-traffic-risk.md for the full plan.

Rules: ask a mod before posting; answer people's questions properly first and mention the tool second; never say
which version people will see (the tool is the experiment).

## Launch post
> Built a free "Experiment Doctor" for Toggle Wars teams: paste your Flagsmith code + metric names and it flags
> the silent killers (enableEvents off, event/metric name mismatch, missing variation key, no flush, old SDK).
> Runs fully in your browser, nothing is uploaded. [link]

## Demo video (~3 min; record Flagsmith screens on Nov 29 after the experiment ends)
| Time | Scene | On screen |
| --- | --- | --- |
| 0:00-0:20 | Hook | "Every team in this hackathon will lose events silently. We built the doctor, and ran our A/B test on them." |
| 0:20-0:55 | The tool | Paste broken code, scan, control vs variant side by side, copy patch, re-scan clean. |
| 0:55-1:40 | Flagsmith | Flag + `patch` variation, warehouse, metrics, wizard, `getExperimentFlag` / `trackEvent` in code. |
| 1:40-2:20 | Results | Chance to beat control, credible interval, guardrail, SRM check, identities per arm (humans, and agents if Plan B ran). |
| 2:20-2:45 | Decision | End the experiment, roll out the winner, public results page. |
| 2:45-3:00 | Impact | Teams scanned, issues found and fixed, repo link. |
Write the script Nov 28 evening so recording takes one hour.
