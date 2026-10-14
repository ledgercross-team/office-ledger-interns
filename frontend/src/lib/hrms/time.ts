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
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
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
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: displayTimeZone() }).format(date);
}

export function formatTime(iso: string | null | undefined): string {
  return format(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso: string | null | undefined): string {
  return format(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  return format(iso, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
