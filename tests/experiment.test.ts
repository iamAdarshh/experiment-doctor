import flagsmith from '@flagsmith/flagsmith';
import { describe, expect, it } from 'vitest';
import { isDemoButtonEnabled } from '@/lib/experiment';

describe.each([true, false])('demo button with deployment default %s', (fallback) => {
  it.each([true, false])('uses an explicit flag set to %s', (enabled) => {
    flagsmith.setState({
      api: 'https://example.test/',
      flags: { show_demo_button: { id: 1, enabled, value: null } },
    });

    expect(isDemoButtonEnabled(fallback)).toBe(enabled);
  });

  it('uses the deployment default when the remote flag is missing', () => {
    flagsmith.setState({ api: 'https://example.test/', flags: {} });

    expect(isDemoButtonEnabled(fallback)).toBe(fallback);
  });
});
