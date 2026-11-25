# Flagsmith Experimentation: verified reference

Read from the official docs on 25 Nov 2026. Experimentation is **in beta**; re-check anything surprising.
Pages: [overview](https://docs.flagsmith.com/experimentation), [create](https://docs.flagsmith.com/experimentation/create-an-experiment),
[run](https://docs.flagsmith.com/experimentation/run-an-experiment), [statistics](https://docs.flagsmith.com/experimentation/statistics),
[coding agent](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent), [JS SDK](https://docs.flagsmith.com/clients/javascript),
[connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse/), [self-hosting](https://docs.flagsmith.com/experimentation/self-hosting).

## Prerequisites
- A **connected warehouse per environment** is mandatory before creating experiments.
- Cloud options: managed Flagsmith warehouse (Environment Settings > Warehouse > Flagsmith > Enable), or your own
  ClickHouse / Databricks / PostgreSQL (**own warehouse requires Scale-Up or Enterprise**). Snowflake/BigQuery "coming soon".
- Warehouse statuses: Created, Pending Connection, Connected, Errored. First event processing "can take up to a few hours".
- Cloud pricing for Experimentation / managed warehouse: **not stated** (ask in Discord).
- Self-hosted: OSS and Enterprise, no plan restriction, `EXPERIMENTATION_ENABLED=true` on the API.

## Minimum SDK versions
| SDK | Package | Minimum |
| --- | --- | --- |
| JavaScript / React | `@flagsmith/flagsmith` | 12.4.0 |
| Node.js | `@flagsmith/nodejs` (old `flagsmith-nodejs` cannot send events) | 9.1.0 |
| Python | `flagsmith` | 6.3.0 |
| Java | `com.flagsmith:flagsmith-java-client` | 8.2.0 |
| Go | `flagsmith-go-client/v5` | v5.3.0 |
| Flutter | `flagsmith` | 6.2.0 |

## Browser (JS SDK)
```ts
import flagsmith from '@flagsmith/flagsmith';
await flagsmith.init({
  environmentID: process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID!,
  enableEvents: true,
  // self-hosted only:
  // api: 'https://flagsmith.example.com/api/v1/',
  // eventProcessorConfig: { eventsApiUrl: 'https://flagsmith.example.com/api/' },
});
await flagsmith.identify('user_42');

// Exposure + value in one call (use only where the user actually sees the change)
const flag = flagsmith.getExperimentFlag('checkout_button');

// Deferred exposure alternative
const f = flagsmith.getAllFlags().checkout_button;
if (f?.experiment?.inExperiment) flagsmith.trackExposureEvent('checkout_button', { value: f.variant });

// Conversion (options: value, traits, metadata)
flagsmith.trackEvent('purchase', { value: 99.5 });

await flagsmith.flushEvents(); // before unload / before an SSR response
```
- `eventProcessorConfig` requires `enableEvents: true`; init **throws** without it.
- React: `FlagsmithProvider` from `@flagsmith/flagsmith/react` with `options={{ ..., enableEvents: true }}`;
  hooks `useFlagsmith()`, `useFlagsmithLoading()`, `useExperiment('flag')` (null until flags load).
- Default Cloud API: `https://edge.api.flagsmith.com/api/v1/`.
- `enableAnalytics` is flag-usage analytics, **not** experiment events.

## Node SDK
```ts
const flagsmith = new Flagsmith({ environmentKey, enableEvents: true /*, apiUrl, eventProcessorConfig */ });
// ... await flagsmith.close() before exit (flushes events)
```
Exact Node method names for experiment flags/events: **check the run-an-experiment page** before use.

## Event rules (gotchas: SDKs skip bad events silently, they don't throw)
- Exposures are deduplicated per identity; first variation seen wins.
- Unidentified users are skipped; identities outside the rollout are not enrolled.
- Conversions count only after the identity's first exposure.
- Event names must match metric names exactly, **case-sensitive**.
- Variations need a **key**; a variation without one isn't counted. `control` is reserved.
- Events batch every 10 s; unflushed events are lost on exit.
- Timestamps older than 10 days or >24 h in the future are rejected; a batch > 2 MiB is rejected whole.
- Self-hosted events URL: Flagsmith DB mode = API URL ending `/api/`; own warehouse = ingestion service URL.
  SDKs append `v1/events` themselves.

## Creating an experiment (dashboard wizard)
Prereqs: connected warehouse; multivariate flag (flag's current value = control) with one keyed variation per
treatment; a metric. One active experiment per flag.
1. Setup: name, hypothesis (change, metric, expected magnitude, timeframe), flag.
2. Rollout: Rollout % (others not counted); variation split sums to 100 ("Split evenly"); bucketing deterministic on identity key.
3. Measurement: primary metric + expected direction (increase / decrease / should not increase / should not decrease).
4. Review & Launch. **The wizard starts the experiment immediately.**
While running: flag config and variations locked; rollout % editable (but changing it hurts validity).
Ending freezes results; an experiment cannot be restarted.
Not stated: how to attach guardrails in the wizard; built-in "roll out winner".

## Metrics
Aggregations: occurrence (0/1 per identity), count, sum, mean.

## CLI (v2+)
```bash
curl -fsSL https://get.flagsmith.com | sh   # or: brew install Flagsmith/tap/flagsmith ; npm i -g @flagsmith/cli
flagsmith login
flagsmith project list
flagsmith environment list --project <p>
flagsmith init --project <p> --environment <key>
flagsmith feature create fix_presentation --value issues --enabled
flagsmith feature variant add fix_presentation --value patch --key patch --weight 0
flagsmith feature get fix_presentation --json
flagsmith api <path>
```
The docs say **don't use the Flagsmith MCP server to set up experiments: it can't start them.**

## Admin API (from the coding-agent guide)
```
POST api/v1/environments/<env key>/experiment-metrics/
  {"name":"rescan_clean","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"rescan_clean"}}
POST api/v1/environments/<env key>/experiments/
  {feature, name, hypothesis, metrics:[{metric, expected_direction:"increase"}],
   experiment_rollout:{enabled, rollout_percentage, feature_state_value,
     multivariate_feature_state_values:[{multivariate_feature_option, percentage_allocation}]}}
POST .../experiments/<id>/start/
POST .../experiments/<id>/results/refresh/   # at most once every 5 minutes
GET  .../experiments/<id>/results/
```
Creating via API does **not** start the experiment; `start/` does (it locks the flag and turns on the rollout).

## Statistics
- Bayesian. Per variation: lift vs control, 95% credible interval, chance to beat control.
- Verdict: Winning > 95% chance; Losing < 5%; otherwise Inconclusive.
- Collecting-data floor: every arm >= 50 identities; conversion metrics also >= 5 conversions.
- SRM warning when imbalance is a 1-in-1000 event or rarer; checked only from 100+ identities.
- Identities seen in multiple variants are quarantined (excluded).
