# Doctor rules spec

Each rule is a real failure from the Flagsmith docs (see 04-flagsmith-experimentation-reference.md).
Most fail silently because the SDKs skip bad events instead of throwing.

## Input
```ts
type DoctorInput = {
  code: string;               // required: pasted source (JS/TS/Python/Go/Java)
  dependencies?: string;      // package.json, requirements.txt, go.mod, pom.xml/gradle
  metricNames?: string[];     // one per line in the UI; trimmed, NOT lowercased
  flagJson?: string;          // output of `flagsmith feature get <flag> --json`
};
```

## Output
```ts
type Confidence = 'certain' | 'possible';
type Issue = {
  ruleId: RuleId;              // e.g. 'events-disabled'
  confidence: Confidence;      // only 'certain' issues block a clean result
  line?: number; column?: number;
  message: string;             // one plain sentence
  docsUrl: string;             // exact Flagsmith docs page
  patch?: { before: string; after: string } | { command: string }; // template-filled, never generated
};
type DoctorResult = {
  engineVersion: string;
  resultId: string;            // sha256(normalizedInput + engineVersion), computed by caller-supplied hasher
  issues: Issue[];             // sorted by RULE_ORDER, line, column, message
  notChecked: { ruleId: RuleId; reason: string }[];
  parseErrors: { line: number; message: string }[];
};
```
Hashing uses Web Crypto, which is async; keep `runChecks` sync and pure, and compute `resultId` in a small wrapper.

## Rules (RULE_ORDER)
| # | ruleId | Detects | Needs | Confidence | Fix | Ship |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `events-disabled` | `getExperimentFlag`/`trackEvent`/`trackExposureEvent` used, init lacks `enableEvents: true` | code | certain | add `enableEvents: true` | Day 1 |
| 2 | `event-metric-mismatch` | `trackEvent('X')` name not in metric list (case-sensitive); suggest nearest by Levenshtein | code + metricNames | certain | rename to closest | Day 1 |
| 3 | `variation-key` | variation without key, or key `control` (reserved) | flagJson | certain | `flagsmith feature variant add ... --key <k>` | Day 1 |
| 4 | `no-flush` | browser/SSR code with events but no `flushEvents()`; Node without `close()`; Python script without flush/`max_buffer_items=1` | code | possible (browser), certain (Node script) | flush on `pagehide` / before response / `close()` | Day 1 |
| 5 | `sdk-too-old` | versions below table minimums; `flagsmith-nodejs` package | dependencies | certain | version bump | Day 1 |
| 6 | `no-exposure` | experiment flag read via `getAllFlags`/`getValue`/`getFlags` with no `trackExposureEvent` for it | code | possible | use `getExperimentFlag` | Day 2 |
| 7 | `no-identity` | events/experiment flags with no `identify()` | code | certain | identify first | Day 2 |
| 8 | `identity-mismatch` | identity in `identify()` differs from the one used in server SDK code | code | possible | one shared id | Day 2 |
| 9 | `conversion-before-exposure` | `trackEvent` on a path before the experiment flag read | code | possible | read flag earlier | Day 3 |
| 10 | `selfhosted-events-url` | `eventsApiUrl` ends in `/v1/events`, or custom `api` without `eventsApiUrl` | code | certain | correct URL shape | Day 3 |
| 11 | `analytics-vs-events` | `enableAnalytics: true` without `enableEvents`; `eventProcessorConfig` without `enableEvents` (init throws) | code | certain | add `enableEvents: true` | Day 3 |

## Rule file contract
```ts
// lib/doctor/rules/<ruleId>.ts
export const rule: Rule = {
  id: 'events-disabled',
  needs: ['code'],                       // missing need -> notChecked, never a pass
  check(ctx: RuleContext): Issue[] { ... } // pure; ctx has normalized input + parsed AST + helpers
};
```
Fixtures: `lib/doctor/fixtures/<ruleId>/broken.<ext>`, `fixed.<ext>`, `expected.json` (snapshot of issues for broken).
