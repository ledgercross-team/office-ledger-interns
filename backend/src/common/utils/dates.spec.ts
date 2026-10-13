import { addDays, daysBetween, eachDate, isHoliday, isSupportedDate, isWeekday } from './dates';

describe('dates', () => {
  it('counts days between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-11')).toBe(10);
    expect(daysBetween('2026-03-11', '2026-03-01')).toBe(-10);
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('detects weekdays', () => {
    expect(isWeekday('2026-10-09')).toBe(false); // Friday holiday
    expect(isWeekday('2026-10-10')).toBe(false); // Saturday holiday
    expect(isWeekday('2026-10-11')).toBe(true); // Sunday
    expect(isHoliday('2026-10-09')).toBe(true);
    expect(isHoliday('2026-10-11')).toBe(false);
  });

  it('lists an inclusive range', () => {
    expect(eachDate('2026-10-09', '2026-10-12')).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
  });
});

describe('supported date window', () => {
  it('accepts 2024 through 2050 and rejects the rest', () => {
    expect(isSupportedDate('2024-01-01')).toBe(true);
    expect(isSupportedDate('2050-12-31')).toBe(true);
    expect(isSupportedDate('2023-12-31')).toBe(false);
    expect(isSupportedDate('2051-01-01')).toBe(false);
  });
});
