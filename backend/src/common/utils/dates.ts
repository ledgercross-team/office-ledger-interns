export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Subscriptions and attendance queries accept dates in this window only.
export const MIN_DATE = '2024-01-01';
export const MAX_DATE = '2050-12-31';

export function isSupportedDate(date: string): boolean {
  return date >= MIN_DATE && date <= MAX_DATE;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday to Friday. */
export function isWeekday(date: string): boolean {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    dates.push(d);
  }
  return dates;
}
