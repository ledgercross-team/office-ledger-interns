/**
 * All date math goes through here. Dates in the DB are UTC instants (timestamptz) or local
 * calendar dates (`date`, "yyyy-MM-dd") in the workspace timezone.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type ISODate = string; // yyyy-MM-dd

/** Local calendar date (yyyy-MM-dd) in `tz` for an instant. */
export const localDate = (tz: string, at: Date = new Date()): ISODate => formatInTimeZone(at, tz, "yyyy-MM-dd");

/** Local wall-clock "HH:mm[:ss]" in `tz` for an instant. */
export const localTime = (tz: string, at: Date = new Date()) => formatInTimeZone(at, tz, "HH:mm:ss");

/** UTC instant for a local date + wall time in `tz`. */
export const zoned = (tz: string, date: ISODate, time: string) =>
  fromZonedTime(`${date}T${time.length === 5 ? `${time}:00` : time}`, tz);

export const minutesOf = (time: string) => {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
};

export const addDaysISO = (d: ISODate, n: number): ISODate => format(addDays(parseISO(d), n), "yyyy-MM-dd");
export const diffDays = (a: ISODate, b: ISODate) => differenceInCalendarDays(parseISO(a), parseISO(b));
export const weekday = (d: ISODate) => parseISO(d).getDay(); // 0 = Sunday

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** "Mon, Mar 3" style formatting that respects the workspace locale. */
export function fmtDate(d: ISODate | Date, locale = "en-US", opts: Intl.DateTimeFormatOptions = {}) {
  const date = typeof d === "string" ? parseISO(d) : d;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", ...opts }).format(date);
}

export function fmtTime(at: Date | string | null | undefined, tz: string, locale = "en-US") {
  if (!at) return "—";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(at));
}

export function fmtDateTime(at: Date | string, tz: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(at));
}

export function fmtMinutes(min: number | null | undefined) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

/** "9 months 3 days" style tenure. */
export function tenure(joined: ISODate | null, today: ISODate) {
  if (!joined) return "—";
  const a = parseISO(joined);
  const b = parseISO(today);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  let anchor = new Date(a.getFullYear(), a.getMonth() + months, a.getDate());
  if (anchor > b) {
    months -= 1;
    anchor = new Date(a.getFullYear(), a.getMonth() + months, a.getDate());
  }
  const days = differenceInCalendarDays(b, anchor);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (rem) parts.push(`${rem} month${rem > 1 ? "s" : ""}`);
  parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export { toZonedTime, formatInTimeZone, parseISO, format };
