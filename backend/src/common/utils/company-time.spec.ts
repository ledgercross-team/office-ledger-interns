import { getCompanyDate, getCompanyMinutes } from './company-time';

describe('company-time', () => {
  const instant = new Date('2026-03-10T23:30:00Z');

  it('returns the UTC date and minutes for UTC', () => {
    expect(getCompanyDate('UTC', instant)).toBe('2026-03-10');
    expect(getCompanyMinutes('UTC', instant)).toBe(23 * 60 + 30);
  });

  it('rolls the date forward for timezones ahead of UTC', () => {
    expect(getCompanyDate('Asia/Dhaka', instant)).toBe('2026-03-11');
    expect(getCompanyMinutes('Asia/Dhaka', instant)).toBe(5 * 60 + 30);
  });

  it('rolls the date back for timezones behind UTC', () => {
    const early = new Date('2026-03-10T02:15:00Z');
    expect(getCompanyDate('America/New_York', early)).toBe('2026-03-09');
    expect(getCompanyMinutes('America/New_York', early)).toBe(22 * 60 + 15);
  });

  it('treats local midnight as minute 0', () => {
    const midnight = new Date('2026-03-10T00:00:00Z');
    expect(getCompanyMinutes('UTC', midnight)).toBe(0);
  });
});
