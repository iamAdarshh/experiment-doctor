// Shapes of real code that tripped the parser when the doctor was run on ~50 public Toggle Wars repos
// (26 Nov 2026). Written in our own words; each test names the problem it guards against.
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../lib/doctor';

const rules = (code: string) => runChecks({ code }).issues.map((issue) => `${issue.confidence}:${issue.ruleId}`);

describe('real-world code shapes', () => {
  it('parses a #! line after a // @file marker (multi-file paste of a Node script)', () => {
    const code = [
      '// @file scripts/simulate.mjs',
      '#!/usr/bin/env node',
      "import Flagsmith from '@flagsmith/nodejs';",
      "const flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      "await flagsmith.getExperimentFlag('f', 'u');",
      "flagsmith.trackEvent('purchase', { identifier: 'u' });",
      'await flagsmith.close();',
    ].join('\n');
    const result = runChecks({ code });
    expect(result.parseErrors).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('parses a #! line at the very top of a single file', () => {
    expect(runChecks({ code: "#!/usr/bin/env node\nimport flagsmith from '@flagsmith/flagsmith';\n" }).parseErrors).toEqual([]);
  });

  it('keeps a browser file and a Node script apart when both call their client `flagsmith`', () => {
    const code = [
      '// @file scripts/simulate.mjs',
      "import Flagsmith from '@flagsmith/nodejs';",
      "const flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      "await flagsmith.getExperimentFlag('f', 'u');",
      "flagsmith.trackEvent('purchase', { identifier: 'u' });",
      'await flagsmith.close();',
      '// @file src/main.ts',
      "import flagsmith from '@flagsmith/flagsmith';",
      // The conversion is in a function written above the init call, as in the repo that showed the bug.
      "function onSignup() { flagsmith.trackEvent('purchase'); }",
      "await flagsmith.init({ environmentID: 'x', enableEvents: true });",
      "await flagsmith.identify('u');",
      "flagsmith.getExperimentFlag('f');",
      "window.addEventListener('pagehide', () => { void flagsmith.flushEvents(); });",
      'export { onSignup };',
    ].join('\n');
    // Before the fix, the browser trackEvent was read as a server call without an identifier ("certain").
    expect(rules(code)).not.toContain('certain:no-identity');
  });

  it('recognises the <script>-tag SDK under another name (`const sdk = window.flagsmith`)', () => {
    const code = [
      'const sdk = window.flagsmith;',
      "await sdk.init({ environmentID: 'x' });",
      "await sdk.identify('u');",
      "sdk.getExperimentFlag('f');",
      "sdk.trackEvent('purchase');",
    ].join('\n');
    expect(runChecks({ code }).notChecked.map((item) => item.ruleId)).not.toContain('events-disabled');
    expect(rules(code)).toContain('certain:events-disabled');
  });

  it('treats whatever getExperimentFlag is called on as a Flagsmith client', () => {
    const code = [
      "import flagsmith from '@flagsmith/flagsmith';",
      "await flagsmith.init({ environmentID: 'x', enableEvents: true });",
      'let client = flagsmith;',
      "await client.identify('u');",
      "client.getExperimentFlag('f');",
      "client.trackEvent('Purchase');",
    ].join('\n');
    const result = runChecks({ code, metricNames: ['purchase'] });
    expect(result.issues.map((issue) => issue.ruleId)).toContain('event-metric-mismatch');
  });

  it('counts a flush on a client returned by a function (`client()?.flushEvents()`)', () => {
    const code = [
      "import { Flagsmith } from '@flagsmith/nodejs';",
      'let cached: Flagsmith | null = null;',
      "function client() { return (cached ??= new Flagsmith({ environmentKey: 'k', enableEvents: true })); }",
      'export async function convert(id: string) {',
      '  const fs = client();',
      "  await fs.getExperimentFlag('f', id);",
      "  fs.trackEvent('purchase', { identifier: id });",
      '}',
      'export async function flush() { await client()?.flushEvents(); }',
    ].join('\n');
    expect(rules(code)).not.toContain('certain:no-flush');
  });

  it('parses Angular / NestJS decorators', () => {
    const code = "import { Component } from '@angular/core';\nimport flagsmith from '@flagsmith/flagsmith';\n@Component({ selector: 'app-root', template: '' })\nexport class AppComponent {}\n";
    expect(runChecks({ code }).parseErrors).toEqual([]);
  });

  it('parses old-style TypeScript casts (`<any>window`) in a .ts file', () => {
    const code = "// @file src/init.ts\nimport flagsmith from '@flagsmith/flagsmith';\n(<any>window).currencies = flagsmith.getValue('currencies');\n";
    expect(runChecks({ code }).parseErrors).toEqual([]);
  });

  it('still reports a real syntax error', () => {
    expect(runChecks({ code: "import flagsmith from '@flagsmith/flagsmith';\nflagsmith.init({ environmentID: 'x' ;\n" }).parseErrors).not.toEqual([]);
  });

  it("does not treat a team's own class named FlagsmithClient as the SDK", () => {
    const code = [
      "import { FlagsmithClient } from './admin-api';",
      "import { Flagsmith } from '@flagsmith/nodejs';",
      "const sdk = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      "const admin = new FlagsmithClient({ environmentKey: 'k' });",
      'export async function run(id: string) {',
      "  await sdk.getExperimentFlag('f', id);",
      "  sdk.trackEvent('purchase', { identifier: id });",
      '  await sdk.close();',
      '}',
    ].join('\n');
    expect(rules(code)).toEqual([]);
  });

  it('is only "possible" about a client without events when another client sends them', () => {
    const code = [
      "import { Flagsmith } from '@flagsmith/nodejs';",
      "const reader = new Flagsmith({ environmentKey: 'k', enableEvents: false });",
      "const sender = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      'export async function run(id: string) {',
      "  await sender.getExperimentFlag('f', id);",
      "  sender.trackEvent('purchase', { identifier: id });",
      '  await sender.close();',
      '}',
    ].join('\n');
    expect(rules(code)).toEqual(['possible:events-disabled']);
  });
});
