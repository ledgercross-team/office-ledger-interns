import { addDays, daysBetween, eachDate, isWeekday } from '../../common/utils/dates';
import { getCompanyDate, getCompanyMinutes } from '../../common/utils/company-time';

export const LATE_AFTER_MINUTES = 15;
export const MAX_RANGE_DAYS = 62;

export type AttendanceStatus = 'present' | 'late';

/** "09:00" or "09:00:00" -> minutes since midnight. */
export function workStartMinutes(workStartTime: string): number {
  const [hours, minutes] = workStartTime.split(':').map(Number);
  return hours * 60 + minutes;
}

// Late when the local check-in is more than 15 minutes after the work start time.
export function attendanceStatus(
  timezone: string,
  workStartTime: string,
  at: Date,
): AttendanceStatus {
  const minutes = getCompanyMinutes(timezone, at);
  return minutes > workStartMinutes(workStartTime) + LATE_AFTER_MINUTES ? 'late' : 'present';
}

/** work_date is the date in the company's timezone, not the UTC date. */
export function workDateFor(timezone: string, at: Date): string {
  return getCompanyDate(timezone, at);
}

export interface DayRecord {
  workDate: string;
  status: AttendanceStatus;
  checkInAt: Date;
  checkOutAt: Date | null;
}

export interface AttendanceDayRow<R extends DayRecord> {
  workDate: string;
  status: AttendanceStatus | 'absent';
  checkInAt: Date | null;
  checkOutAt: Date | null;
  record: R | null;
}

// One row per day that has a record, plus every weekday up to today without one (absent).
export function buildDays<R extends DayRecord>(
  records: R[],
  from: string,
  to: string,
  today: string,
): AttendanceDayRow<R>[] {
  const byDate = new Map(records.map((record) => [record.workDate, record]));
  const rows: AttendanceDayRow<R>[] = [];

  for (const date of eachDate(from, to).reverse()) {
    const record = byDate.get(date);
    if (record) {
      rows.push({
        workDate: date,
        status: record.status,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        record,
      });
    } else if (date <= today && isWeekday(date)) {
      rows.push({
        workDate: date,
        status: 'absent',
        checkInAt: null,
        checkOutAt: null,
        record: null,
      });
    }
  }

  return rows;
}

/** Null when the range is valid, otherwise the reason. */
export function rangeError(from: string, to: string): string | null {
  if (to < from) return 'to must not be before from.';
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    return `The range may not exceed ${MAX_RANGE_DAYS} days.`;
  }
  return null;
}

export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -29), to: today };
}

// ---------------------------------------------------------------------------------------
// Check-in / check-out tendencies. Deliberately simple, so a manager can explain every number:
//   attendance rate  = days attended / weekdays in the window
//   punctuality rate = on-time days / days attended
//   checkout rate    = days with a check-out / past days attended
//   score            = 50% attendance + 35% punctuality + 15% checkout
//   arrival offset   = average check-in minus work start, in minutes (negative = early)
// ---------------------------------------------------------------------------------------

export type Tendency = 'no_data' | 'early_bird' | 'on_time' | 'cutting_it_close' | 'often_late';
export type Trend = 'unknown' | 'improving' | 'steady' | 'slipping';

export interface StatsRecord {
  workDate: string;
  status: AttendanceStatus;
  checkInAt: Date;
  checkOutAt: Date | null;
}

export interface StatsDay {
  date: string;
  status: AttendanceStatus | 'absent';
  checkInMinutes: number | null;
  checkOutMinutes: number | null;
  hours: number | null;
}

export interface AttendanceStats {
  from: string;
  to: string;
  workStartMinutes: number;
  expectedDays: number;
  daysOnTime: number;
  daysLate: number;
  daysAbsent: number;
  missedCheckOuts: number;
  attendanceRate: number | null;
  punctualityRate: number | null;
  avgCheckInMinutes: number | null;
  avgCheckOutMinutes: number | null;
  avgArrivalOffset: number | null;
  avgHoursWorked: number | null;
  score: number | null;
  tendency: Tendency;
  trend: Trend;
  series: StatsDay[];
}

const EARLY_BY = 10;
const ON_TIME_BY = 5;
const TREND_STEP = 5;

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, n) => sum + n, 0) / values.length;
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.min(100, Math.round((part / whole) * 100));
}

export function computeStats(input: {
  records: StatsRecord[];
  from: string;
  to: string;
  today: string;
  timezone: string;
  workStartTime: string;
}): AttendanceStats {
  const { records, from, today, timezone } = input;
  // Never look past today: the future has no attendance yet.
  const to = input.to > today ? today : input.to;
  const start = workStartMinutes(input.workStartTime);
  const byDate = new Map(records.map((record) => [record.workDate, record]));

  const series: StatsDay[] = [];
  const offsets: number[] = [];
  const checkIns: number[] = [];
  const checkOuts: number[] = [];
  const hours: number[] = [];
  let expectedDays = 0;
  let daysOnTime = 0;
  let daysLate = 0;
  let daysAbsent = 0;
  let attendedPast = 0;
  let missedCheckOuts = 0;

  for (const date of from <= to ? eachDate(from, to) : []) {
    const record = byDate.get(date);
    const weekday = isWeekday(date);

    if (weekday && (record || date < today)) {
      expectedDays += 1;
    }

    if (!record) {
      if (weekday && date < today) {
        daysAbsent += 1;
        series.push({
          date,
          status: 'absent',
          checkInMinutes: null,
          checkOutMinutes: null,
          hours: null,
        });
      }
      continue;
    }

    const checkIn = getCompanyMinutes(timezone, record.checkInAt);
    const checkOut = record.checkOutAt ? getCompanyMinutes(timezone, record.checkOutAt) : null;
    const worked = record.checkOutAt
      ? Math.round(((record.checkOutAt.getTime() - record.checkInAt.getTime()) / 3_600_000) * 10) /
        10
      : null;

    if (record.status === 'late') {
      daysLate += 1;
    } else {
      daysOnTime += 1;
    }
    checkIns.push(checkIn);
    offsets.push(checkIn - start);
    if (checkOut !== null) checkOuts.push(checkOut);
    if (worked !== null) hours.push(worked);
    if (date < today) {
      attendedPast += 1;
      if (!record.checkOutAt) missedCheckOuts += 1;
    }

    series.push({
      date,
      status: record.status,
      checkInMinutes: checkIn,
      checkOutMinutes: checkOut,
      hours: worked,
    });
  }

  const attended = daysOnTime + daysLate;
  const attendanceRate = percent(attended, expectedDays);
  const punctualityRate = percent(daysOnTime, attended);
  const checkoutRate = percent(attendedPast - missedCheckOuts, attendedPast);
  const avgOffset = mean(offsets);
  const lateShare = attended === 0 ? 0 : daysLate / attended;

  let tendency: Tendency = 'no_data';
  if (avgOffset !== null) {
    if (avgOffset <= -EARLY_BY) tendency = 'early_bird';
    else if (avgOffset <= ON_TIME_BY) tendency = 'on_time';
    else tendency = lateShare >= 0.3 ? 'often_late' : 'cutting_it_close';
  }

  // Compare the first and second half of the window's check-ins.
  let trend: Trend = 'unknown';
  if (offsets.length >= 4) {
    const half = Math.floor(offsets.length / 2);
    const delta = (mean(offsets.slice(-half)) as number) - (mean(offsets.slice(0, half)) as number);
    trend = delta <= -TREND_STEP ? 'improving' : delta >= TREND_STEP ? 'slipping' : 'steady';
  }

  // Someone who never came in scores 0 outright; the checkout term only rewards attendees.
  const score =
    attendanceRate === null
      ? null
      : attended === 0
        ? 0
        : Math.round(
            0.5 * attendanceRate + 0.35 * (punctualityRate ?? 0) + 0.15 * (checkoutRate ?? 100),
          );

  const round = (value: number | null) => (value === null ? null : Math.round(value));

  return {
    from,
    to,
    workStartMinutes: start,
    expectedDays,
    daysOnTime,
    daysLate,
    daysAbsent,
    missedCheckOuts,
    attendanceRate,
    punctualityRate,
    avgCheckInMinutes: round(mean(checkIns)),
    avgCheckOutMinutes: round(mean(checkOuts)),
    avgArrivalOffset: round(avgOffset),
    avgHoursWorked: hours.length === 0 ? null : Math.round((mean(hours) as number) * 10) / 10,
    score,
    tendency,
    trend,
    series,
  };
}
