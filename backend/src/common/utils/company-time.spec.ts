import { getCompanyDate, getCompanyMinutes, isValidTimezone } from './company-time';

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

describe('getCompanyMinutes', () => {
  it('returns minutes since midnight in UTC', () => {
    expect(getCompanyMinutes('UTC', new Date('2026-03-10T23:30:00Z'))).toBe(23 * 60 + 30);
  });

  it('applies the company timezone', () => {
    expect(getCompanyMinutes('Asia/Dhaka', new Date('2026-03-10T23:30:00Z'))).toBe(5 * 60 + 30);
  });

  it('treats local midnight as 0', () => {
    expect(getCompanyMinutes('UTC', new Date('2026-03-10T00:00:00Z'))).toBe(0);
  });
});

describe('isValidTimezone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Asia/Dhaka')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('accepts fixed whole-hour offsets represented as IANA zones', () => {
    expect(isValidTimezone('Etc/GMT-6')).toBe(true); // UTC+06:00
    expect(isValidTimezone('Etc/GMT+8')).toBe(true); // UTC-08:00
  });
});
