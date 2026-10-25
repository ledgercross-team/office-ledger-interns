import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { NotificationsService } from '../notifications/notifications.service';
import { iso } from '../hrms-rows';
import type { CreateLeaveDto, ListLeaveQueryDto } from './dto/leave.dto';

interface LeaveRow extends Record<string, unknown> {
  request_id: string;
  member_id: string;
  full_name: string;
  leave_type_id: string;
  leave_name: string;
  is_paid: boolean;
  start_date: string;
  end_date: string;
  start_half_day: boolean;
  end_half_day: boolean;
  days: string;
  reason: string;
  over_allowance: boolean;
  cancelled_at: string | null;
  status: string;
  requested_by: string;
  decision_reason: string | null;
  decided_by_name: string | null;
  created_at: string;
  started: boolean;
  block_reason: string | null;
}

const LEAVE_SELECT = (viewer: string | null) => sql`
  select l.request_id, l.member_id, u.full_name, l.leave_type_id, lt.name as leave_name, lt.is_paid,
         l.start_date::text as start_date, l.end_date::text as end_date,
         l.start_half_day, l.end_half_day, l.days::text as days, l.reason, l.over_allowance, l.cancelled_at,
         r.status::text as status, r.requested_by, r.decision_reason, ud.full_name as decided_by_name,
         r.created_at, (l.start_date <= current_date) as started,
         case when r.status = 'pending' then request_decider_error(r, ${viewer}) end as block_reason
    from leave_requests l
    join requests r on r.id = l.request_id
    join leave_types lt on lt.id = l.leave_type_id
    join org_members m on m.id = l.member_id
    join users u on u.id = m.user_id
    left join org_members md on md.id = r.decided_by
    left join users ud on ud.id = md.user_id`;

function toLeave(r: LeaveRow, viewer: string | null) {
  const cancelled = r.cancelled_at !== null;
  const open = !cancelled && ['pending', 'approved', 'applied'].includes(r.status);
  return {
    requestId: r.request_id,
    member: { id: r.member_id, fullName: r.full_name },
    leaveType: { id: r.leave_type_id, name: r.leave_name, isPaid: r.is_paid },
    startDate: r.start_date,
    endDate: r.end_date,
    startHalfDay: r.start_half_day,
    endHalfDay: r.end_half_day,
    days: Number(r.days),
    reason: r.reason,
    overAllowance: r.over_allowance,
    status: cancelled ? 'cancelled' : r.status,
    decisionReason: r.decision_reason,
    decidedBy: r.decided_by_name,
    createdAt: iso(r.created_at),
    canCancel: open && r.requested_by === viewer && !r.started,
    canDecide: !cancelled && r.status === 'pending' && r.block_reason === null,
    cannotDecideBecause: !cancelled && r.status === 'pending' ? r.block_reason : null,
  };
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async balance(p: HrmsPrincipal) {
    if (p.role === 'ceo') {
      throw new ForbiddenException('CEOs only decide leave requests.');
    }
    const r = await this.context.tx.execute<{
      leave_type_id: string;
      code: string;
      name: string;
      is_paid: boolean;
      year: number;
      allowance: string;
      used: string;
      remaining: string;
    }>(sql`
      select b.leave_type_id, b.code, lt.name, lt.is_paid, b.year::int as year,
             b.allowance::text, b.used::text, b.remaining::text
        from v_leave_balance b join leave_types lt on lt.id = b.leave_type_id
       where b.member_id = ${p.memberId} and b.org_id = current_org_id()
       order by lt.name`);
    return {
      items: r.rows.map((b) => ({
        leaveTypeId: b.leave_type_id,
        code: b.code,
        name: b.name,
        isPaid: b.is_paid,
        year: b.year,
        allowance: Number(b.allowance),
        used: Number(b.used),
        remaining: Number(b.remaining),
      })),
    };
  }

  async list(p: HrmsPrincipal, q: ListLeaveQueryDto) {
    const scope = q.scope ?? 'mine';
    if (p.role === 'ceo' && scope !== 'decide') {
      throw new ForbiddenException('CEOs only decide leave requests.');
    }
    const where: SQL[] = [sql`l.org_id = current_org_id()`];
    if (scope === 'mine') {
      where.push(sql`l.member_id = ${p.memberId}`);
    } else if (scope === 'decide') {
      where.push(
        sql`r.status = 'pending'`,
        sql`l.cancelled_at is null`,
        sql`request_decider_error(r, ${p.memberId}) is null`,
      );
    } else if (p.role === 'ceo' || p.role === 'coo') {
      // everyone in the org (row-level security keeps this to one org)
    } else if (p.role === 'manager') {
      where.push(sql`(l.member_id = ${p.memberId} or exists (
        select 1 from project_members a
          join project_members b on b.project_id = a.project_id and b.org_id = a.org_id
         where a.member_id = ${p.memberId} and a.role = 'manager' and a.removed_at is null
           and b.member_id = l.member_id and b.removed_at is null))`);
    } else {
      where.push(sql`l.member_id = ${p.memberId}`);
    }
    const rows = await this.context.tx.execute<LeaveRow>(sql`
      ${LEAVE_SELECT(p.memberId)}
       where ${sql.join(where, sql` and `)}
       order by l.start_date desc, r.created_at desc limit 200`);
    return { items: rows.rows.map((r) => toLeave(r, p.memberId)) };
  }

  async create(p: HrmsPrincipal, dto: CreateLeaveDto) {
    if (p.role === 'ceo') {
      throw new ForbiddenException('CEOs only decide leave requests.');
    }
    const tx = this.context.tx;
    if (dto.endDate < dto.startDate) {
      const message = 'End date must be on or after the start date.';
      throw new UnprocessableEntityException({ message, errors: { endDate: [message] } });
    }
    if (dto.startDate === dto.endDate && dto.startHalfDay && dto.endHalfDay) {
      const message = 'A single day cannot be half a day at both ends. Use one half day.';
      throw new BadRequestException({ message, errors: { endHalfDay: [message] } });
    }

    const type = await tx.execute(
      sql`select 1 from leave_types where id = ${dto.leaveTypeId} and org_id = current_org_id() and is_active`,
    );
    if (type.rows.length === 0) {
      const message = 'Choose an active leave type.';
      throw new NotFoundException({ message, errors: { leaveTypeId: [message] } });
    }

    // Working days only: weekends and org holidays do not count; a half day at either end is 0.5.
    const counted = await tx.execute<{ days: string }>(sql`
      with s as (select weekend_days from org_settings where org_id = current_org_id()),
           d as (
             select g::date as day
               from generate_series(${dto.startDate}::date, ${dto.endDate}::date, interval '1 day') g, s
              where extract(isodow from g)::smallint <> all (s.weekend_days)
                and not exists (select 1 from org_holidays h
                                 where h.org_id = current_org_id() and h.holiday_date = g::date))
      select (count(*)
              - case when ${dto.startHalfDay === true} and exists (select 1 from d where day = ${dto.startDate}::date)
                     then 0.5 else 0 end
              - case when ${dto.endHalfDay === true} and ${dto.startDate} <> ${dto.endDate}
                          and exists (select 1 from d where day = ${dto.endDate}::date)
                     then 0.5 else 0 end)::text as days
        from d`);
    const days = Number(counted.rows[0]?.days ?? 0);
    if (!(days > 0)) {
      const message = 'Choose a date range that includes at least one working day.';
      throw new BadRequestException({ message, errors: { endDate: [message] } });
    }

    const bal = await tx.execute<{ remaining: string }>(sql`
      select remaining::text from v_leave_balance
       where member_id = ${p.memberId} and leave_type_id = ${dto.leaveTypeId} and org_id = current_org_id()`);
    const remaining = Number(bal.rows[0]?.remaining ?? 0);
    const over = days > remaining;

    const key = `leave|${p.memberId}|${dto.startDate}|${dto.endDate}`;
    const created = await tx.execute<{ id: string }>(sql`
      insert into requests (org_id, type, requested_by, payload, reason, dedupe_key, expires_at)
      values (current_org_id(), 'leave', ${p.memberId}, '{}'::jsonb, ${dto.reason.trim()}, ${key}, now())
      on conflict (org_id, dedupe_key) where status = 'pending' and dedupe_key is not null do nothing
      returning id`);
    const id = created.rows[0]?.id;
    if (!id) {
      const message = 'You already have a pending leave request for these dates.';
      throw new ConflictException({ message, errors: { endDate: [message] } });
    }

    await tx.execute(sql`
      insert into leave_requests (request_id, org_id, member_id, leave_type_id, start_date, end_date,
                                  start_half_day, end_half_day, days, reason, over_allowance)
      values (${id}, current_org_id(), ${p.memberId}, ${dto.leaveTypeId}, ${dto.startDate}::date,
              ${dto.endDate}::date, ${dto.startHalfDay === true}, ${dto.endHalfDay === true}, ${days},
              ${dto.reason.trim()}, ${over})`);
    await this.notifications.notifyDeciders(id, 'A leave request is waiting for your decision');
    return this.get(p, id);
  }

  async cancel(p: HrmsPrincipal, requestId: string) {
    if (p.role === 'ceo') {
      throw new ForbiddenException('CEOs only decide leave requests.');
    }
    const tx = this.context.tx;
    const own = await tx.execute<{ status: string }>(sql`
      select r.status::text as status from leave_requests l join requests r on r.id = l.request_id
       where l.request_id = ${requestId} and l.org_id = current_org_id() and l.member_id = ${p.memberId}`);
    if (own.rows.length === 0) throw new NotFoundException('Leave request not found.');
    // The database refuses once the leave has started (that needs a leave_change request).
    await tx.execute(sql`
      update leave_requests set cancelled_at = now()
       where request_id = ${requestId} and org_id = current_org_id() and cancelled_at is null`);
    await tx.execute(sql`
      update requests set status = 'cancelled'
       where id = ${requestId} and org_id = current_org_id() and status in ('pending', 'approved')`);
    return this.get(p, requestId);
  }

  private async get(p: HrmsPrincipal, requestId: string) {
    const r = await this.context.tx.execute<LeaveRow>(sql`
      ${LEAVE_SELECT(p.memberId)} where l.request_id = ${requestId} and l.org_id = current_org_id()`);
    if (!r.rows[0]) throw new NotFoundException('Leave request not found.');
    return toLeave(r.rows[0], p.memberId);
  }
}
