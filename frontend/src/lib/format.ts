export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** YYYY-MM-DD as a calendar date, with no timezone shift. */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' });
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
