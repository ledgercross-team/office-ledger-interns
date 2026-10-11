import { daysLeft, pickSubscription } from './subscription-utils';

const sub = (startsOn: string, endsOn: string, cancelledAt: Date | null = null) => ({
  startsOn,
  endsOn,
  cancelledAt,
});

describe('subscription utils', () => {
  const today = '2026-10-11';

  it('prefers the current subscription', () => {
    const current = sub('2026-10-01', '2026-12-31');
    expect(pickSubscription([sub('2025-01-01', '2025-12-31'), current], today)).toBe(current);
  });

  it('falls back to the latest ended one', () => {
    const latest = sub('2026-01-01', '2026-06-30');
    expect(pickSubscription([sub('2025-01-01', '2025-12-31'), latest], today)).toBe(latest);
  });

  it('ignores cancelled subscriptions', () => {
    expect(pickSubscription([sub('2026-10-01', '2026-12-31', new Date())], today)).toBeNull();
  });

  it('computes days left, negative once ended', () => {
    expect(daysLeft(sub('2026-10-01', '2026-10-21'), today)).toBe(10);
    expect(daysLeft(sub('2026-01-01', '2026-10-01'), today)).toBe(-10);
    expect(daysLeft(null, today)).toBeNull();
  });
});
