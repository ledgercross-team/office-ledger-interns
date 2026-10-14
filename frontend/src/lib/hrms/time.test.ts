import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTime, setDisplayTimeZone, to12Hour } from './time';

describe('12-hour time', () => {
  it('shows afternoon, midnight and noon with AM/PM', () => {
    setDisplayTimeZone('UTC');
    expect(to12Hour('2026-10-14 15:21')).toBe('03:21 PM');
    expect(to12Hour('00:05')).toBe('12:05 AM');
    expect(to12Hour('12:00')).toBe('12:00 PM');
    expect(to12Hour('09:30')).toBe('09:30 AM');
  });
  it('formats instants in the display zone with AM/PM', () => {
    setDisplayTimeZone('Asia/Dhaka');
    expect(formatTime('2026-10-14T09:21:00Z')).toMatch(/^03:21 PM$/);
    expect(formatDateTime('2026-10-14T09:21:00Z')).toMatch(/03:21 PM$/);
    setDisplayTimeZone(null);
  });
});
