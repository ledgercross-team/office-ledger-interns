// Attendance dates and lateness use the company's IANA timezone (default UTC).

function partsInZone(timezone: string, now: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** The calendar date (YYYY-MM-DD) in the company's timezone. */
export function getCompanyDate(timezone: string, now: Date = new Date()): string {
  const { year, month, day } = partsInZone(timezone, now);
  return `${year}-${month}-${day}`;
}

/** Minutes since local midnight (0 to 1439) in the company's timezone. */
export function getCompanyMinutes(timezone: string, now: Date = new Date()): number {
  const { hour, minute } = partsInZone(timezone, now);
  return Number(hour) * 60 + Number(minute);
}
