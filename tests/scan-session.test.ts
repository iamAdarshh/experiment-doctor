import { describe, expect, it } from 'vitest';
import { NEW_SESSION, recordScan } from '../lib/scan-session';

const MINUTE = 60_000;

describe('scan session (experiment event rules, docs/05-experiment-design.md)', () => {
  it('a clean first scan never enrolls and sends nothing', () => {
    const first = recordScan(NEW_SESSION, 0, 0);
    expect(first.enrollNow).toBe(false);
    expect(recordScan(first.session, 0, MINUTE).events).toEqual([]);
  });

  it('enrolls on the first scan with certain issues, once', () => {
    const first = recordScan(NEW_SESSION, 2, 0);
    expect(first.enrollNow).toBe(true);
    expect(recordScan(first.session, 1, MINUTE).enrollNow).toBe(false);
  });

  it('rescan_clean + minutes_to_clean fire once, when issues go to zero', () => {
    const first = recordScan(NEW_SESSION, 2, 0);
    const second = recordScan(first.session, 1, MINUTE);
    expect(second.events).toEqual([{ name: 'rescan_count' }]);
    const third = recordScan(second.session, 0, 3.5 * MINUTE);
    expect(third.events).toEqual([{ name: 'rescan_count' }, { name: 'rescan_clean' }, { name: 'minutes_to_clean', value: 3.5 }]);
    const fourth = recordScan(third.session, 0, 4 * MINUTE);
    expect(fourth.events).toEqual([{ name: 'rescan_count' }]);
  });

  it('minutes are counted from the first scan of the visit, even if it was clean', () => {
    const first = recordScan(NEW_SESSION, 0, 0);
    const second = recordScan(first.session, 1, MINUTE);
    expect(second.enrollNow).toBe(true);
    const third = recordScan(second.session, 0, 2 * MINUTE);
    expect(third.events).toContainEqual({ name: 'minutes_to_clean', value: 2 });
  });
});
