export function formatDateTime(iso: string, timezone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  })
    .format(new Date(iso))
    .replace(', ', ' · ');
}

/** YYYY-MM-DD as a calendar date, with no timezone shift, shown as DD/MM/YYYY. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

/** Converts an IANA timezone into the compact company-facing label used in the UI. */
export function formatGmtOffset(timezone?: string, at: Date = new Date()): string {
  if (!timezone) return 'GMT +0';

  const zoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!zoneName || zoneName === 'GMT') return 'GMT +0';

  const match = /^GMT([+-])(\d{2})(?::?(\d{2}))?$/.exec(zoneName);
  if (!match) return zoneName;

  const sign = match[1];
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return minutes ? `GMT ${sign}${hours}:${String(minutes).padStart(2, '0')}` : `GMT ${sign}${hours}`;
}

export function formatTime(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short', timeZone: timezone });
}

function zonedParts(instant: number, timezone: string): number[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return [part('year'), part('month'), part('day'), part('hour'), part('minute')];
}

/** An instant as "YYYY-MM-DDTHH:mm" on the wall clock of `timezone`, for datetime-local inputs. */
export function toZonedInput(iso: string, timezone: string): string {
  const [y, mo, d, h, mi] = zonedParts(new Date(iso).getTime(), timezone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

/** The inverse: a wall-clock time in `timezone` as an ISO instant. */
export function fromZonedInput(local: string, timezone: string): string {
  const [date, time] = local.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);

  // Find the zone offset at that moment; repeat once so a DST change is handled.
  let instant = wall;
  for (let i = 0; i < 2; i += 1) {
    const [zy, zmo, zd, zh, zmi] = zonedParts(instant, timezone);
    instant = wall - (Date.UTC(zy, zmo - 1, zd, zh, zmi) - instant);
  }
  return new Date(instant).toISOString();
}

// Builds "?a=1&b=2", skipping empty values.
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/** Today's calendar date (YYYY-MM-DD) on the company's clock, not the browser's. */
export function todayIn(timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Minutes since midnight as "9:05 AM". */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** "12 min early", "on time", "8 min late". */
export function formatOffset(offset: number | null): string {
  if (offset === null) return '—';
  if (Math.abs(offset) < 1) return 'on time';
  return `${Math.abs(offset)} min ${offset < 0 ? 'early' : 'late'}`;
}

/** The supported calendar window for subscriptions and attendance filters. */
export const MIN_DATE = '2024-01-01';
export const MAX_DATE = '2050-12-31';
