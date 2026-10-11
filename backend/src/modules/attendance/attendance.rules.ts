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
