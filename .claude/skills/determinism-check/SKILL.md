---
name: determinism-check
description: Audit lib/doctor for anything that could make output non-deterministic or unreliable, and run the determinism, round-trip and false-positive tests. Use before merging engine changes or when output differs between runs.
---

# Determinism check

Rules: docs/07-determinism.md.

1. Static scan of `lib/doctor/**`. Flag any use of:
   `Date`, `performance.now`, `Math.random`, `crypto.randomUUID`, `fetch`, `XMLHttpRequest`, `localStorage`,
   `sessionStorage`, `process.env`, `import ... from 'react'`, `@flagsmith/*`, `setTimeout`, `Intl` with
   locale defaults, `localeCompare` without a fixed locale, `Object.keys/entries` or `Set`/`Map` iteration
   that feeds output order without an explicit sort.
2. Check sorting: final issues sorted by (RULE_ORDER index, line, column, message) with a total, stable comparator.
3. Check normalization happens once, before rules: LF, no BOM, trailing whitespace trimmed, metric names trimmed
   but case kept.
4. Check patches: template strings only; no generated or random text.
5. Check `package.json`: exact versions only; lockfile committed; `ENGINE_VERSION` bumped if output changed.
6. Run: `npx vitest run tests/determinism tests/roundtrip tests/corpus`.
7. Report findings as file:line with a one-line fix each, most severe first. If clean, say so plainly.
