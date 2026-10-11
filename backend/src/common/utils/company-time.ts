const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getCompanyDate(timezone: string, at: Date = new Date()): string {
  const formatted =
    timezone === 'UTC'
      ? DATE_FORMAT.format(at)
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(at);

  // en-CA already produces YYYY-MM-DD; be robust to engines that emit slashes.
  return formatted.replaceAll('/', '-');
}

/** Minutes since local midnight (0 to 1439) in the company's timezone. */
export function getCompanyMinutes(timezone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return part('hour') * 60 + part('minute');
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
