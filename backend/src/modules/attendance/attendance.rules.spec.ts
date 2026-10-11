import { attendanceStatus, buildDays, rangeError, workDateFor } from './attendance.rules';

describe('attendanceStatus', () => {
  const at = (time: string) => new Date(`2026-03-10T${time}:00Z`);

  it('is present up to 15 minutes after a 09:00 start', () => {
    expect(attendanceStatus('UTC', '09:00', at('09:15'))).toBe('present');
  });

  it('is late from 09:16', () => {
    expect(attendanceStatus('UTC', '09:00', at('09:16'))).toBe('late');
  });

  it('uses the company timezone and accepts HH:mm:ss', () => {
    // 03:16 UTC is 09:16 in Asia/Dhaka (+06:00).
    expect(attendanceStatus('Asia/Dhaka', '09:00:00', at('03:16'))).toBe('late');
    expect(attendanceStatus('Asia/Dhaka', '09:00:00', at('03:15'))).toBe('present');
  });
});

describe('workDateFor', () => {
  it('uses the local date when it differs from the UTC date', () => {
    const at = new Date('2026-03-10T23:30:00Z');
    expect(workDateFor('UTC', at)).toBe('2026-03-10');
    expect(workDateFor('Asia/Dhaka', at)).toBe('2026-03-11');
    expect(workDateFor('America/Los_Angeles', new Date('2026-03-10T03:00:00Z'))).toBe('2026-03-09');
  });
});

describe('buildDays', () => {
  const record = (workDate: string, status: 'present' | 'late' = 'present') => ({
    workDate,
    status,
    checkInAt: new Date(`${workDate}T09:00:00Z`),
    checkOutAt: null,
  });

  it('adds absent rows for weekdays without a record, newest first', () => {
    // 2026-10-05 Mon .. 2026-10-09 Fri
    const rows = buildDays(
      [record('2026-10-05'), record('2026-10-07', 'late')],
      '2026-10-05',
      '2026-10-09',
      '2026-10-09',
    );
    expect(rows.map((row) => [row.workDate, row.status])).toEqual([
      ['2026-10-09', 'absent'],
      ['2026-10-08', 'absent'],
      ['2026-10-07', 'late'],
      ['2026-10-06', 'absent'],
      ['2026-10-05', 'present'],
    ]);
  });

  it('skips weekends and future days', () => {
    const rows = buildDays([], '2026-10-09', '2026-10-13', '2026-10-12');
    expect(rows.map((row) => row.workDate)).toEqual(['2026-10-12', '2026-10-09']);
  });

  it('keeps a weekend record', () => {
    const rows = buildDays([record('2026-10-10')], '2026-10-10', '2026-10-11', '2026-10-11');
    expect(rows.map((row) => row.workDate)).toEqual(['2026-10-10']);
  });
});

describe('rangeError', () => {
  it('rejects a reversed range and one over 62 days', () => {
    expect(rangeError('2026-10-10', '2026-10-01')).not.toBeNull();
    expect(rangeError('2026-01-01', '2026-03-05')).not.toBeNull();
  });

  it('accepts exactly 62 days', () => {
    expect(rangeError('2026-01-01', '2026-03-03')).toBeNull();
  });
});
