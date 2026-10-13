import {
  attendanceStatus,
  buildDays,
  computeStats,
  rangeError,
  workDateFor,
} from './attendance.rules';

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

  it('adds absent rows for workdays without a record, newest first', () => {
    // 2026-10-05 Mon .. 2026-10-09 Fri; Friday is a holiday.
    const rows = buildDays(
      [record('2026-10-05'), record('2026-10-07', 'late')],
      '2026-10-05',
      '2026-10-09',
      '2026-10-09',
    );
    expect(rows.map((row) => [row.workDate, row.status])).toEqual([
      ['2026-10-08', 'absent'],
      ['2026-10-07', 'late'],
      ['2026-10-06', 'absent'],
      ['2026-10-05', 'present'],
    ]);
  });

  it('skips holidays and future days', () => {
    const rows = buildDays([], '2026-10-09', '2026-10-13', '2026-10-12');
    expect(rows.map((row) => row.workDate)).toEqual(['2026-10-12', '2026-10-11']);
  });

  it('keeps a holiday record', () => {
    const rows = buildDays([record('2026-10-10')], '2026-10-10', '2026-10-11', '2026-10-11');
    expect(rows.map((row) => row.workDate)).toEqual(['2026-10-11', '2026-10-10']);
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

describe('computeStats', () => {
  const base = { timezone: 'UTC', workStartTime: '09:00', today: '2026-10-12' };
  const at = (date: string, time: string) => new Date(`${date}T${time}:00.000Z`);
  const record = (date: string, inTime: string, outTime: string | null, status: 'present' | 'late') => ({
    workDate: date,
    status,
    checkInAt: at(date, inTime),
    checkOutAt: outTime ? at(date, outTime) : null,
  });

  it('counts on-time, late and absent workdays and averages the check-in', () => {
    // Mon 5 Oct to Fri 9 Oct 2026: Friday is a holiday.
    const stats = computeStats({
      ...base,
      from: '2026-10-05',
      to: '2026-10-09',
      records: [
        record('2026-10-05', '08:50', '17:00', 'present'),
        record('2026-10-06', '09:30', '17:30', 'late'),
        record('2026-10-08', '09:00', '17:00', 'present'),
        record('2026-10-09', '08:55', '16:55', 'present'),
      ],
    });

    expect(stats.expectedDays).toBe(4);
    expect(stats.daysOnTime).toBe(3);
    expect(stats.daysLate).toBe(1);
    expect(stats.daysAbsent).toBe(1);
    expect(stats.attendanceRate).toBe(100);
    expect(stats.punctualityRate).toBe(75);
    expect(stats.avgCheckInMinutes).toBe(9 * 60 + 4); // 09:04 average
    expect(stats.avgArrivalOffset).toBe(4);
    expect(stats.tendency).toBe('on_time');
    expect(stats.series).toHaveLength(5);
  });

  it('does not mark today absent before they check in, and ignores holidays', () => {
    const stats = computeStats({
      ...base,
      from: '2026-10-09', // Friday
      to: '2026-10-12', // Monday, which is today
      records: [record('2026-10-09', '09:00', '17:00', 'present')],
    });

    expect(stats.expectedDays).toBe(1);
    expect(stats.daysAbsent).toBe(1);
  });

  it('calls someone who usually arrives early an early bird', () => {
    const stats = computeStats({
      ...base,
      from: '2026-10-05',
      to: '2026-10-07',
      records: ['05', '06', '07'].map((d) => record(`2026-10-${d}`, '08:40', '17:00', 'present')),
    });

    expect(stats.tendency).toBe('early_bird');
    expect(stats.avgArrivalOffset).toBe(-20);
  });

  it('reports a slipping trend when later days are later', () => {
    const stats = computeStats({
      ...base,
      from: '2026-10-05',
      to: '2026-10-08',
      records: [
        record('2026-10-05', '08:55', '17:00', 'present'),
        record('2026-10-06', '08:58', '17:00', 'present'),
        record('2026-10-07', '09:10', '17:00', 'present'),
        record('2026-10-08', '09:14', '17:00', 'present'),
      ],
    });

    expect(stats.trend).toBe('slipping');
  });

  it('has no tendency without any check-ins', () => {
    const stats = computeStats({ ...base, from: '2026-10-05', to: '2026-10-06', records: [] });

    expect(stats.tendency).toBe('no_data');
    expect(stats.score).toBe(0);
    expect(stats.avgCheckInMinutes).toBeNull();
  });
});
