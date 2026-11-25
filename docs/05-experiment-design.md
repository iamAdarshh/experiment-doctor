# Experiment design (pre-registration): human experiment

Since 25 Nov this is the **secondary** experiment. The primary, agent experiment is pre-registered in
docs/10-agent-experiment.md and follows the same stopping rule date.

Write final values here **before** launching in Production. Don't edit sections 1 to 5 after launch; add to the decision log instead.

## 1. Hypothesis
Showing a ready-made fix (variant `patch`) instead of a diagnosis with docs links (control `issues`) raises the
share of teams that reach a clean re-scan within one visit, without slowing them down.
Expected magnitude: at least +15 percentage points (a guess; see docs/09-traffic-risk.md for what we can detect).

## 2. Setup
| Item | Value |
| --- | --- |
| Environment | Production (simulated traffic only ever in `Simulation`) |
| Flag | `fix_presentation`, enabled, value `issues` = control |
| Variation | key `patch`, value `patch` |
| Rollout | 100%, split evenly 50/50 |
| Identity | random UUID per browser in `localStorage`, passed to `identify()` |
| Enrollment / exposure | `getExperimentFlag('fix_presentation')` when the first issue list renders (clean first scans never enrolled) |

## 3. Metrics
| Metric | Event | Aggregation | Direction | Role |
| --- | --- | --- | --- | --- |
| rescan_clean | `rescan_clean` | occurrence | increase | primary |
| minutes_to_clean | `minutes_to_clean` (value = minutes since first scan) | mean | should not increase | guardrail |
| rescan_count | `rescan_count` | count | (observe) | secondary |
`patch_copied` is logged as a plain event (variant only), not an experiment metric.

Definitions:
- `rescan_clean`: a scan with 0 **certain** issues after an earlier scan in the same visit had >= 1.
- All events carry `metadata.engine_version`.

## 4. Stopping rule
- Read results at **12:00 PM IST, 29 Nov** and not before for a decision.
- Ship `patch` only if chance to beat control > 95%, guardrail not losing, and no SRM warning.
- Otherwise report "inconclusive", keep control as default, and say what sample would be needed.
- Flagsmith shows no verdict until each arm has >= 50 identities and >= 5 conversions.

## 5. Threats to validity
- Small sample (see docs/09-traffic-risk.md).
- Engine changes mid-experiment: both arms always run the same engine; `engine_version` in metadata.
- Same team on multiple browsers = multiple identities (accepted; noted in README).

## 6. Decision log
| Date/time (IST) | What | Why |
| --- | --- | --- |
| | | |
