/**
 * One place for how times are shown. Instants arrive as UTC ISO strings.
 * They are shown in the person's profile time zone; while the profile still
 * has the default "UTC" (never set), the browser's own zone is used, so the
 * clock on screen matches the clock on the wall.
 */
let profileZone: string | null = null;

export function setDisplayTimeZone(zone: string | null | undefined): void {
  profileZone = zone && zone !== 'UTC' ? zone : null;
}

function validZone(zone: string | null): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

export function displayTimeZone(): string | undefined {
  return validZone(profileZone);
}

function format(iso: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: displayTimeZone() }).format(date);
}

export function formatTime(iso: string | null | undefined): string {
  return format(iso, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(iso: string | null | undefined): string {
  return format(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  return format(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** "15:21" (or "2026-10-14 15:21") from the API's local time strings, shown as "03:21 PM". */
export function to12Hour(local: string): string {
  const match = /(\d{2}):(\d{2})\s*$/.exec(local);
  if (!match) return local;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${String(hours % 12 === 0 ? 12 : hours % 12).padStart(2, '0')}:${match[2]} ${suffix}`;
}
