# False-positive corpus

Correct Flagsmith Experimentation code. The doctor must report **zero issues** on every file here
(tests/engine/corpus.test.ts). Each file is adapted from the snippets in
docs/04-flagsmith-experimentation-reference.md (read from docs.flagsmith.com on 25 Nov 2026).

When a real team reports a false positive, add their (anonymised) correct code here first, then fix the rule.

`team-*` files (added 26 Nov 2026) follow patterns seen in public Toggle Wars repos that use Flagsmith
Experimentation: flag and event names in constants, names exported from another file, and the SDK loaded from a CDN.
They are written in our own words, not copied, because those repos' licences are unknown.

(The `Flagsmith/experimentation-demo-app` repo named in an earlier TODO is not public, so it is not used.)
