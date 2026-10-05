/** Pure calendar helpers (browser + server): recurrence expansion and ICS generation. */
import { addDaysISO, eachDay, localDate, localTime, weekday, zoned, type ISODate } from "./dates";

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface MeetingLike {
  id: string;
  title: string;
  startsAt: Date | string;
  durationMin: number;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
}

export interface Occurrence<M> {
  meeting: M;
  date: ISODate;
  start: Date;
  end: Date;
}

/** "Daily" means every working day: configured weekend days are skipped. */
export function occursOn(m: Pick<MeetingLike, "recurrence" | "recurrenceUntil">, first: ISODate, day: ISODate, weekendDays: number[] = []) {
  if (day < first || (m.recurrenceUntil && day > m.recurrenceUntil)) return false;
  switch (m.recurrence) {
    case "none":
      return day === first;
    case "daily":
      return day === first || !weekendDays.includes(weekday(day));
    case "weekly":
      return weekday(day) === weekday(first);
    case "monthly":
      return day.slice(8) === first.slice(8);
  }
}

/** Expand meetings (with their recurrence rules) into dated occurrences within [from, to]. */
export function expand<M extends MeetingLike>(meetings: M[], from: ISODate, to: ISODate, tz: string, weekendDays: number[] = []): Occurrence<M>[] {
  const out: Occurrence<M>[] = [];
  const days = eachDay(from, to);
  for (const m of meetings) {
    const startsAt = new Date(m.startsAt);
    const first = localDate(tz, startsAt);
    const time = localTime(tz, startsAt);
    for (const d of days) {
      if (!occursOn(m, first, d, weekendDays)) continue;
      const start = d === first ? startsAt : zoned(tz, d, time);
      out.push({ meeting: m, date: d, start, end: new Date(start.getTime() + m.durationMin * 60000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---- ICS -----------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (d: ISODate) => d.replace(/-/g, "");

/** Fold lines to 75 octets as required by RFC 5545. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** Timed event */
  start?: Date;
  end?: Date;
  /** All-day event (end is exclusive per RFC 5545; we pass the inclusive last day) */
  allDay?: { start: ISODate; end: ISODate };
  rrule?: string | null;
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function rruleFor(rec: Recurrence, until: string | null, weekendDays: number[] = []) {
  if (rec === "none") return null;
  const freq = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" }[rec];
  const byday = rec === "daily" && weekendDays.length ? `;BYDAY=${BYDAY.filter((_, i) => !weekendDays.includes(i)).join(",")}` : "";
  return `FREQ=${freq}${byday}${until ? `;UNTIL=${dateOnly(until)}T235959Z` : ""}`;
}

export function buildIcs(name: string, events: IcsEvent[]) {
  const now = utc(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Office Ledger//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.allDay.start)}`, `DTEND;VALUE=DATE:${dateOnly(addDaysISO(e.allDay.end, 1))}`);
    else if (e.start && e.end) lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
