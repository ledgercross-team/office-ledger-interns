import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { NotificationsService } from '../notifications/notifications.service';
import { iso } from '../hrms-rows';
import type { FileCorrectionDto } from './dto/attendance.dto';

interface DayRow extends Record<string, unknown> {
  day: string;
  status: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  worked_minutes: number | null;
  auto_checked_out: boolean | null;
  corrected_by_request: string | null;
  holiday_name: string | null;
  leave_code: string | null;
}

interface CorrectionRow extends Record<string, unknown> {
  request_id: string;
  work_date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  original_snapshot: Record<string, unknown> | null;
  status: string;
  decision_reason: string | null;
  decided_by_name: string | null;
  created_at: string;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** The address the database compares with the office networks (IPv4-mapped form unwrapped). */
function cleanIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/i, '');
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  // A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async checkIn(p: HrmsPrincipal, rawIp: string | null | undefined) {
    // Recorded when readable. The database refuses a missing or foreign address only
    // when the CEO or COO has set office networks; with none set, nothing is checked.
    const ip = cleanIp(rawIp);
    // The database decides present or late.
    const r = await this.context.tx.execute<{ id: string }>(sql`
      insert into attendance_days (org_id, member_id, work_date, status, check_in_at, check_in_ip)
      select current_org_id(), ${p.memberId}, (now() at time zone s.timezone)::date, 'present', now(), ${ip}::inet
        from org_settings s where s.org_id = current_org_id()
      on conflict (member_id, work_date) do update
         set check_in_at = now(), check_in_ip = ${ip}::inet
       where attendance_days.check_in_at is null
      returning id`);
    if (r.rows.length === 0) throw new ConflictException('You have already checked in today.');
    return this.today(p);
  }

  async checkOut(p: HrmsPrincipal) {
    const r = await this.context.tx.execute(sql`
      update attendance_days a set check_out_at = now()
        from org_settings s
       where s.org_id = a.org_id and a.member_id = ${p.memberId}
         and a.work_date = (now() at time zone s.timezone)::date
         and a.check_in_at is not null and a.check_out_at is null
      returning a.id`);
    if (r.rows.length === 0) throw new ConflictException('There is no open check-in for today.');
    return this.today(p);
  }

  async today(p: HrmsPrincipal) {
    const r = await this.context.tx.execute<{
      work_date: string;
      status: string | null;
      check_in_at: string | null;
      check_out_at: string | null;
    }>(sql`
      select (now() at time zone s.timezone)::date::text as work_date, a.status::text as status,
             a.check_in_at, a.check_out_at
        from org_settings s
        left join attendance_days a on a.member_id = ${p.memberId} and a.org_id = s.org_id
             and a.work_date = (now() at time zone s.timezone)::date
       where s.org_id = current_org_id()`);
    const row = r.rows[0];
    return {
      date: row?.work_date,
      status: row?.status ?? null,
      checkInAt: iso(row?.check_in_at ?? null),
      checkOutAt: iso(row?.check_out_at ?? null),
    };
  }

  async me(p: HrmsPrincipal, month?: string) {
    return {
      today: await this.today(p),
      ...(await this.monthFor(p.memberId as string, month ?? currentMonth())),
    };
  }

  /** CEO/COO anyone; a manager only people on a project they manage. */
  async forMember(p: HrmsPrincipal, memberId: string, month?: string) {
    await this.assertVisible(p, memberId);
    return this.monthFor(memberId, month ?? currentMonth());
  }

  /** One day across the people the caller may see. */
  async teamDay(p: HrmsPrincipal, date?: string) {
    const rows = await this.context.tx.execute<{
      member_id: string;
      full_name: string;
      role: string;
      status: string | null;
      check_in_at: string | null;
      check_out_at: string | null;
      auto_checked_out: boolean | null;
      day: string;
    }>(sql`
      select m.id as member_id, u.full_name, m.role::text as role, a.status::text as status,
             a.check_in_at, a.check_out_at, a.auto_checked_out, d.day::text as day
        from org_members m
        join users u on u.id = m.user_id
        join org_settings s on s.org_id = m.org_id
        cross join lateral (select coalesce(${date ?? null}::date, (now() at time zone s.timezone)::date) as day) d
        left join attendance_days a on a.member_id = m.id and a.work_date = d.day
       where m.org_id = current_org_id() and m.status = 'active' and m.role in ('manager', 'employee')
         and ${this.visibleTo(p)}
       order by u.full_name`);
    return {
      date: rows.rows[0]?.day ?? date ?? null,
      items: rows.rows.map((r) => ({
        memberId: r.member_id,
        fullName: r.full_name,
        role: r.role,
        status: r.status,
        checkInAt: iso(r.check_in_at),
        checkOutAt: iso(r.check_out_at),
        autoCheckedOut: r.auto_checked_out === true,
      })),
    };
  }

  async fileCorrection(p: HrmsPrincipal, dto: FileCorrectionDto) {
    if (!dto.checkInAt && !dto.checkOutAt) {
      throw new BadRequestException('Give the corrected check-in time, check-out time, or both.');
    }
    const tx = this.context.tx;
    const day = await tx.execute<{
      id: string | null;
      has_check_in: boolean | null;
      ok: boolean;
    }>(sql`
      select a.id, (a.check_in_at is not null) as has_check_in,
             (coalesce((${dto.checkInAt ?? null}::timestamptz at time zone s.timezone)::date, ${dto.workDate}::date) = ${dto.workDate}::date
              and coalesce((${dto.checkOutAt ?? null}::timestamptz at time zone s.timezone)::date, ${dto.workDate}::date) = ${dto.workDate}::date) as ok
        from org_settings s
        left join attendance_days a on a.org_id = s.org_id and a.member_id = ${p.memberId}
             and a.work_date = ${dto.workDate}::date
       where s.org_id = current_org_id()`);
    const info = day.rows[0];
    if (!info?.ok) throw new BadRequestException('The times must fall on the day being corrected.');
    if (!dto.checkInAt && !info.has_check_in) {
      throw new BadRequestException('That day has no check-in yet, so give a check-in time too.');
    }

    const key = `attendance_correction|${p.memberId}|${dto.workDate}`;
    const created = await tx.execute<{ id: string }>(sql`
      insert into requests (org_id, type, requested_by, payload, reason, dedupe_key, expires_at)
      values (current_org_id(), 'attendance_correction', ${p.memberId},
              ${JSON.stringify({ work_date: dto.workDate })}::jsonb, ${dto.reason.trim()}, ${key}, now())
      on conflict (org_id, dedupe_key) where status = 'pending' and dedupe_key is not null do nothing
      returning id`);
    const requestId = created.rows[0]?.id;
    if (!requestId)
      throw new ConflictException('A correction for this day is already waiting for a decision.');

    await tx.execute(sql`
      insert into attendance_corrections
        (request_id, org_id, member_id, work_date, attendance_day_id, requested_check_in, requested_check_out, reason)
      values (${requestId}, current_org_id(), ${p.memberId}, ${dto.workDate}::date, ${info.id},
              ${dto.checkInAt ?? null}::timestamptz, ${dto.checkOutAt ?? null}::timestamptz, ${dto.reason.trim()})`);
    await this.notifications.notifyDeciders(
      requestId,
      'An attendance correction is waiting for your decision',
    );
    return { requestId };
  }

  /**
   * Called from the approval transaction. Changes the day with corrected_by_request set; the
   * database keeps the original in attendance_corrections.original_snapshot.
   */
  async applyCorrection(requestId: string): Promise<void> {
    const tx = this.context.tx;
    const c = await tx.execute<{
      member_id: string;
      work_date: string;
      requested_check_in: string | null;
      requested_check_out: string | null;
    }>(sql`
      select member_id, work_date::text as work_date, requested_check_in, requested_check_out
        from attendance_corrections where request_id = ${requestId} and org_id = current_org_id()`);
    const row = c.rows[0];
    if (!row) throw new NotFoundException('Correction not found.');

    const updated = await tx.execute(sql`
      update attendance_days
         set check_in_at = coalesce(${row.requested_check_in}::timestamptz, check_in_at),
             check_out_at = coalesce(${row.requested_check_out}::timestamptz, check_out_at),
             check_in_ip = coalesce(check_in_ip, (select host(n.network)::inet from org_office_networks n
                                                   where n.org_id = current_org_id() limit 1)),
             corrected_by_request = ${requestId}
       where member_id = ${row.member_id} and work_date = ${row.work_date}::date
         and org_id = current_org_id()
      returning id`);
    if (updated.rows.length > 0) return;

    if (!row.requested_check_in)
      throw new BadRequestException('A day with no entry needs a check-in time.');
    // No entry for the day: there is no real address, so the first office network (if any) stands in.
    await tx.execute(sql`
      insert into attendance_days (org_id, member_id, work_date, status, check_in_at, check_in_ip,
                                   check_out_at, corrected_by_request)
      values (current_org_id(), ${row.member_id}, ${row.work_date}::date, 'present',
              ${row.requested_check_in}::timestamptz,
              (select host(n.network)::inet from org_office_networks n
                where n.org_id = current_org_id() limit 1),
              ${row.requested_check_out}::timestamptz, ${requestId})`);
  }

  async reportCsv(p: HrmsPrincipal, month?: string): Promise<string> {
    const m = month ?? currentMonth();
    const rows = await this.context.tx.execute<{
      full_name: string;
      email: string;
      role: string;
      present: number;
      late: number;
      absent: number;
      on_leave: number;
      worked_minutes: number;
    }>(sql`
      with s as (select * from org_settings where org_id = current_org_id())
      select u.full_name, u.email, m.role::text as role,
             count(a.id) filter (where a.status = 'present')::int as present,
             count(a.id) filter (where a.status = 'late')::int as late,
             count(a.id) filter (where a.status = 'absent')::int as absent,
             count(a.id) filter (where a.status = 'on_leave')::int as on_leave,
             coalesce(sum(a.worked_minutes), 0)::int as worked_minutes
        from org_members m
        join users u on u.id = m.user_id
        left join attendance_days a on a.member_id = m.id
             and a.work_date >= (${m}::text || '-01')::date
             and a.work_date < ((${m}::text || '-01')::date + interval '1 month')
       where m.org_id = current_org_id() and m.role in ('manager', 'employee') and ${this.visibleTo(p)}
       group by u.full_name, u.email, m.role
       order by u.full_name`);
    const lines = [
      ['Name', 'Email', 'Role', 'Month', 'Present', 'Late', 'Absent', 'On leave', 'Hours worked'],
    ];
    for (const r of rows.rows) {
      lines.push([
        r.full_name,
        r.email,
        r.role,
        m,
        String(r.present),
        String(r.late),
        String(r.absent),
        String(r.on_leave),
        (r.worked_minutes / 60).toFixed(1),
      ]);
    }
    return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // ---- helpers --------------------------------------------------------
  private visibleTo(p: HrmsPrincipal): SQL {
    if (p.role === 'ceo' || p.role === 'coo') return sql`true`;
    return sql`(m.id = ${p.memberId} or exists (
      select 1 from project_members a
        join project_members b on b.project_id = a.project_id and b.org_id = a.org_id
       where a.member_id = ${p.memberId} and a.role = 'manager' and a.removed_at is null
         and b.member_id = m.id and b.removed_at is null))`;
  }

  private async assertVisible(p: HrmsPrincipal, memberId: string): Promise<void> {
    const r = await this.context.tx.execute(sql`
      select 1 from org_members m where m.id = ${memberId} and m.org_id = current_org_id() and ${this.visibleTo(p)}`);
    if (r.rows.length === 0) throw new NotFoundException('Person not found.');
  }

  private async monthFor(memberId: string, month: string) {
    const tx = this.context.tx;
    const days = await tx.execute<DayRow>(sql`
      with s as (select * from org_settings where org_id = current_org_id()),
           m1 as (select (${month}::text || '-01')::date as d)
      select g.d::text as day, a.status::text as status, a.check_in_at, a.check_out_at, a.worked_minutes,
             a.auto_checked_out, a.corrected_by_request, h.name as holiday_name, l.leave_code
        from m1 cross join s cross join lateral (select (m1.d + n)::date as d from generate_series(0, 30) n
                       where m1.d + n < (m1.d + interval '1 month')::date) as g
        left join attendance_days a on a.member_id = ${memberId}::uuid and a.work_date = g.d::date
        left join org_holidays h on h.org_id = s.org_id and h.holiday_date = g.d::date
        left join lateral (select v.leave_code from v_approved_leave v
                            where v.member_id = ${memberId}::uuid and g.d::date between v.start_date and v.end_date
                            limit 1) l on true
       order by g.d`);
    const today = await tx.execute<{ d: string; weekend: number[] }>(sql`
      select (now() at time zone timezone)::date::text as d, weekend_days as weekend
        from org_settings where org_id = current_org_id()`);
    const todayStr = today.rows[0]?.d ?? '';
    const weekend = today.rows[0]?.weekend ?? [];

    const corrections = await tx.execute<CorrectionRow>(sql`
      select c.request_id, c.work_date::text as work_date, c.requested_check_in, c.requested_check_out,
             c.reason, c.original_snapshot, r.status::text as status, r.decision_reason,
             ud.full_name as decided_by_name, r.created_at
        from attendance_corrections c
        join requests r on r.id = c.request_id
        left join org_members md on md.id = r.decided_by
        left join users ud on ud.id = md.user_id
       where c.member_id = ${memberId}::uuid and c.org_id = current_org_id()
         and c.work_date >= (${month}::text || '-01')::date
         and c.work_date < ((${month}::text || '-01')::date + interval '1 month')
       order by c.work_date, r.created_at`);

    return {
      month,
      // The org's calendar date today, so the screen can put today first and skip the future.
      todayDate: todayStr,
      days: days.rows.map((d) => {
        const isoDow = ((new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
        const fallback = d.holiday_name
          ? 'holiday'
          : d.leave_code
            ? 'on_leave'
            : weekend.includes(isoDow)
              ? 'weekend'
              : d.day < todayStr
                ? 'absent'
                : null;
        return {
          date: d.day,
          status: d.status ?? fallback,
          checkInAt: iso(d.check_in_at),
          checkOutAt: iso(d.check_out_at),
          workedMinutes: d.worked_minutes,
          autoCheckedOut: d.auto_checked_out === true,
          corrected: d.corrected_by_request !== null,
          holiday: d.holiday_name,
          leaveType: d.leave_code,
        };
      }),
      corrections: corrections.rows.map((c) => ({
        requestId: c.request_id,
        workDate: c.work_date,
        requestedCheckIn: iso(c.requested_check_in),
        requestedCheckOut: iso(c.requested_check_out),
        reason: c.reason,
        original: c.original_snapshot,
        status: c.status,
        decisionReason: c.decision_reason,
        decidedBy: c.decided_by_name,
        createdAt: iso(c.created_at),
      })),
    };
  }
}
