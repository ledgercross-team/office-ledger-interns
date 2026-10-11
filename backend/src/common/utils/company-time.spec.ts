import { getCompanyDate } from './company-time';

describe('getCompanyDate', () => {
  it('formats a UTC instant as YYYY-MM-DD', () => {
    expect(getCompanyDate('UTC', new Date('2026-10-11T00:00:00Z'))).toBe('2026-10-11');
  });

  it('converts timezones before deriving the date', () => {
    const instant = new Date('2026-10-11T00:00:00Z');
    expect(getCompanyDate('America/New_York', instant)).toBe('2026-10-10');
  });

  it('defaults to "now" when no date is given', () => {
    expect(getCompanyDate('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
