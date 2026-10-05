import { and, eq, gte, isNull, lte, sql, count } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  attendance,
  attendanceBreaks,
  attendanceCorrections,
  breakWindows,
  dailyReportCorrections,
  dailyReportSnapshots,
  workspaceSettings,
} from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { addDaysISO, localDate, localTime, minutesOf, weekday, zoned, fmtTime } from "@/lib/dates";

export type Settings = typeof workspaceSettings.$inferSelect;

export async function getSettings(tx: Tx, workspaceId: string): Promise<Settings> {
  const [s] = await tx.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
  if (s) return s;
  const [created] = await tx.insert(workspaceSettings).values({ workspaceId }).returning();
  return created!;
}

export interface CheckInInput {
  mode: "office" | "remote";
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  ip?: string;
}

export class AttendanceError extends Error {
  constructor(
    message: string,
    public code: "CONFLICT" | "BAD_REQUEST" | "FORBIDDEN" = "BAD_REQUEST",
  ) {
    super(message);
  }
}

/** Haversine distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Pure rule: status, late minutes and whether approval is needed for a check-in. */
export function classifyCheckIn(s: Pick<Settings, "officeStart" | "lateThresholdMin" | "approvalMode">, localHHMM: string, mode: "office" | "remote", halfDay = false) {
  const lateBy = minutesOf(localHHMM) - minutesOf(s.officeStart);
  const late = !halfDay && lateBy > s.lateThresholdMin;
  const status = halfDay ? ("half_day" as const) : late ? ("late" as const) : mode === "remote" ? ("remote" as const) : ("present" as const);
  const needs =
    !halfDay &&
    ((late && (s.approvalMode === "late" || s.approvalMode === "both")) ||
      (mode === "remote" && (s.approvalMode === "remote" || s.approvalMode === "both")));
  return { status, lateMinutes: late ? lateBy : 0, approval: needs ? ("pending" as const) : ("not_required" as const) };
}

/** Monday-based week window (local dates) containing `day`. */
function weekBounds(day: string) {
  const dow = weekday(day); // 0 = Sun
  const start = addDaysISO(day, -((dow + 6) % 7));
  return { start, end: addDaysISO(start, 6) };
}

export async function checkIn(tx: Tx, ctx: WorkspaceContext, input: CheckInInput, now = new Date()) {
  const s = await getSettings(tx, ctx.workspaceId);
  const today = localDate(ctx.timezone, now);
  const hhmm = localTime(ctx.timezone, now).slice(0, 5);

  const [existing] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.membershipId, ctx.membershipId), eq(attendance.date, today)));
  if (existing?.checkInAt) throw new AttendanceError("You're already checked in today.", "CONFLICT");
  if (existing?.status === "on_leave") throw new AttendanceError("You're on approved leave today.", "CONFLICT");

  // Optional geofence / office-IP policy for office check-ins.
  let withinGeofence: boolean | undefined;
  if (input.mode === "office" && s.geo.enabled) {
    const ipOk = s.geo.allowedIps.length > 0 && !!input.ip && s.geo.allowedIps.includes(input.ip);
    const geoOk =
      s.geo.lat != null && s.geo.lng != null && input.lat != null && input.lng != null
        ? distanceM({ lat: s.geo.lat, lng: s.geo.lng }, { lat: input.lat, lng: input.lng }) <= s.geo.radiusM
        : false;
    withinGeofence = ipOk || geoOk;
    if (!withinGeofence)
      throw new AttendanceError("Office check-in needs you to be at the office (location or office network). Choose Remote instead.", "FORBIDDEN");
  }

  const halfDay = existing?.status === "half_day";
  const c = classifyCheckIn(s, hhmm, input.mode, halfDay);
  let approval: "pending" | "not_required" = c.approval;
  let note = input.note?.trim() || null;

  // Remote quota: more remote days than policy allows always needs approval.
  if (input.mode === "remote") {
    const wk = weekBounds(today);
    const [used] = await tx
      .select({ n: count() })
      .from(attendance)
      .where(
        and(
          eq(attendance.membershipId, ctx.membershipId),
          eq(attendance.mode, "remote"),
          gte(attendance.date, wk.start),
          lte(attendance.date, wk.end),
        ),
      );
    if ((used?.n ?? 0) >= s.remoteDaysPerWeek) {
      approval = "pending";
      note = [note, `Over remote quota (${s.remoteDaysPerWeek}/week)`].filter(Boolean).join(" · ");
    }
  }

  const values = {
    mode: input.mode,
    status: c.status,
    lateMinutes: c.lateMinutes,
    checkInAt: now,
    approval,
    note,
    source: "self" as const,
    checkInMeta: { ip: undefined, lat: input.lat ?? undefined, lng: input.lng ?? undefined, withinGeofence },
  };
  const [row] = existing
    ? await tx.update(attendance).set(values).where(eq(attendance.id, existing.id)).returning()
    : await tx
        .insert(attendance)
        .values({ workspaceId: ctx.workspaceId, membershipId: ctx.membershipId, date: today, ...values })
        .returning();
  return { row: row!, settings: s, needsApproval: approval === "pending" };
}

export async function checkOut(tx: Tx, ctx: WorkspaceContext, now = new Date()) {
  const today = localDate(ctx.timezone, now);
  const [row] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.membershipId, ctx.membershipId), eq(attendance.date, today)));
  if (!row?.checkInAt) throw new AttendanceError("You haven't checked in today.", "CONFLICT");
  if (row.checkOutAt) throw new AttendanceError("You've already checked out.", "CONFLICT");
  await endOpenBreak(tx, row.id, now);
  const [updated] = await tx.update(attendance).set({ checkOutAt: now }).where(eq(attendance.id, row.id)).returning();
  return updated!;
}

async function endOpenBreak(tx: Tx, attendanceId: string, now: Date) {
  const [open] = await tx
    .select()
    .from(attendanceBreaks)
    .where(and(eq(attendanceBreaks.attendanceId, attendanceId), isNull(attendanceBreaks.endedAt)));
  if (!open) return 0;
  const minutes = Math.max(0, Math.round((now.getTime() - open.startedAt.getTime()) / 60000));
  await tx.update(attendanceBreaks).set({ endedAt: now }).where(eq(attendanceBreaks.id, open.id));
  await tx
    .update(attendance)
    .set({ breakMinutes: sql`${attendance.breakMinutes} + ${minutes}` })
    .where(eq(attendance.id, attendanceId));
  return minutes;
}

export async function startBreak(tx: Tx, ctx: WorkspaceContext, breakWindowId: string | null, now = new Date()) {
  const today = localDate(ctx.timezone, now);
  const [row] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.membershipId, ctx.membershipId), eq(attendance.date, today)));
  if (!row?.checkInAt || row.checkOutAt) throw new AttendanceError("Check in before starting a break.", "CONFLICT");
  const [open] = await tx
    .select()
    .from(attendanceBreaks)
    .where(and(eq(attendanceBreaks.attendanceId, row.id), isNull(attendanceBreaks.endedAt)));
  if (open) throw new AttendanceError("You're already on a break.", "CONFLICT");
  if (breakWindowId) {
    const [bw] = await tx.select().from(breakWindows).where(eq(breakWindows.id, breakWindowId));
    if (!bw) throw new AttendanceError("Unknown break window.");
  }
  await tx.insert(attendanceBreaks).values({ workspaceId: ctx.workspaceId, attendanceId: row.id, breakWindowId, startedAt: now });
}

export async function endBreak(tx: Tx, ctx: WorkspaceContext, now = new Date()) {
  const today = localDate(ctx.timezone, now);
  const [row] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.membershipId, ctx.membershipId), eq(attendance.date, today)));
  if (!row) throw new AttendanceError("No attendance today.", "CONFLICT");
  const minutes = await endOpenBreak(tx, row.id, now);
  return minutes;
}

/**
 * Applies an approved correction to the attendance row. If the day's report is already locked, the
 * change is recorded in daily_report_corrections instead of altering the snapshot.
 */
export async function applyCorrection(tx: Tx, ctx: WorkspaceContext, correctionId: string) {
  const [c] = await tx.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, correctionId));
  if (!c) throw new AttendanceError("Correction not found.");
  const s = await getSettings(tx, ctx.workspaceId);
  const [row] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.membershipId, c.membershipId), eq(attendance.date, c.date)));
  const checkInAt = c.requestedCheckIn ?? row?.checkInAt ?? null;
  const checkOutAt = c.requestedCheckOut ?? row?.checkOutAt ?? null;
  let status = row?.status ?? "present";
  let lateMinutes = row?.lateMinutes ?? 0;
  if (checkInAt && c.requestedCheckIn && status !== "half_day" && status !== "on_leave") {
    const cls = classifyCheckIn({ ...s, approvalMode: "none" }, localTime(ctx.timezone, checkInAt).slice(0, 5), row?.mode ?? "office");
    status = cls.status;
    lateMinutes = cls.lateMinutes;
  }
  const patch = { checkInAt, checkOutAt, status, lateMinutes, autoCheckedOut: false, source: "correction" as const };
  if (row) await tx.update(attendance).set(patch).where(eq(attendance.id, row.id));
  else
    await tx.insert(attendance).values({
      workspaceId: ctx.workspaceId,
      membershipId: c.membershipId,
      date: c.date,
      mode: "office",
      approval: "approved",
      ...patch,
    });

  const [snap] = await tx
    .select({ id: dailyReportSnapshots.id })
    .from(dailyReportSnapshots)
    .where(and(eq(dailyReportSnapshots.workspaceId, ctx.workspaceId), eq(dailyReportSnapshots.date, c.date)));
  if (snap) {
    const parts = [
      c.requestedCheckIn ? `check-in → ${fmtTime(c.requestedCheckIn, ctx.timezone)}` : null,
      c.requestedCheckOut ? `check-out → ${fmtTime(c.requestedCheckOut, ctx.timezone)}` : null,
    ].filter(Boolean);
    await tx.insert(dailyReportCorrections).values({
      workspaceId: ctx.workspaceId,
      date: c.date,
      kind: "attendance_correction",
      description: `Attendance corrected: ${parts.join(", ")}`,
      sourceTable: "attendance_corrections",
      sourceId: c.id,
      data: { membershipId: c.membershipId, before: row ? { checkInAt: row.checkInAt, checkOutAt: row.checkOutAt } : null },
      createdBy: ctx.membershipId,
    });
  }
}

/** Converts a local "HH:mm" on a local date to a UTC instant for this workspace. */
export const localToInstant = (tz: string, date: string, hhmm: string) => zoned(tz, date, hhmm);
