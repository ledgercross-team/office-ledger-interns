// Building an Intl.DateTimeFormat is slow, and stats format thousands of timestamps,
// so each formatter is built once per timezone.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(timezone: string): Intl.DateTimeFormat {
  let format = dateFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormats.set(timezone, format);
  }
  return format;
}

function timeFormat(timezone: string): Intl.DateTimeFormat {
  let format = timeFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timeFormats.set(timezone, format);
  }
  return format;
}

export function getCompanyDate(timezone: string, at: Date = new Date()): string {
  // en-CA already produces YYYY-MM-DD; be robust to engines that emit slashes.
  return dateFormat(timezone).format(at).replaceAll('/', '-');
}

/** Minutes since local midnight (0 to 1439) in the company's timezone. */
export function getCompanyMinutes(timezone: string, at: Date = new Date()): number {
  const parts = timeFormat(timezone).formatToParts(at);
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
