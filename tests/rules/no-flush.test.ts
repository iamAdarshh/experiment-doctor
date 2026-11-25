import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../lib/doctor';
import { fixtureTests, issuesFor } from '../helpers/rule-suite';

describe('no-flush', () => {
  fixtureTests('no-flush');

  it('browser code without a flush is "possible" and gets a pagehide patch after init', () => {
    const code = [
      "import flagsmith from '@flagsmith/flagsmith';",
      "await flagsmith.init({ environmentID: 'x', enableEvents: true });",
      "await flagsmith.identify('u');",
      "flagsmith.trackEvent('purchase');",
    ].join('\n');
    const [issue] = issuesFor('no-flush', code);
    expect(issue?.confidence).toBe('possible');
    const patched = applyPatch(code, issue!.patch!);
    expect(patched.split('\n')[2]).toContain("addEventListener('pagehide'");
    expect(issuesFor('no-flush', patched)).toEqual([]);
  });

  it('a long-running server is only "possible"', () => {
    const code = [
      "import Flagsmith from '@flagsmith/nodejs';",
      "const flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      "app.post('/buy', (req, res) => { flagsmith.trackEvent('purchase', { identifier: req.userId }); res.end(); });",
      'app.listen(3000);',
    ].join('\n');
    expect(issuesFor('no-flush', code)[0]?.confidence).toBe('possible');
  });

  it('close() counts as a flush', () => {
    const code = [
      "import Flagsmith from '@flagsmith/nodejs';",
      "const flagsmith = new Flagsmith({ environmentKey: 'k', enableEvents: true });",
      "flagsmith.trackEvent('purchase', { identifier: 'u' });",
      'await flagsmith.close();',
    ].join('\n');
    expect(issuesFor('no-flush', code)).toEqual([]);
  });
});
