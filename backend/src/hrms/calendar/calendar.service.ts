import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type { CalendarQueryDto, CreateMeetingDto, UpdateMeetingDto } from './dto/calendar.dto';

interface EventRow extends Record<string, unknown> {
  kind: string;
  ref_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  link: string | null;
  location: string | null;
  member_id: string | null;
  full_name: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  starts_local: string;
  ends_local: string;
  tz: string;
}

interface MeetingRow extends Record<string, unknown> {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  meeting_link: string | null;
  location: string | null;
  project_id: string | null;
  created_by: string;
  created_by_name: string;
  cancelled_at: string | null;
  invitees: Array<{ memberId: string; fullName: string; response: string }>;
  starts_local: string;
  ends_local: string;
  tz: string;
}

function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

@Injectable()
export class CalendarService {
  constructor(private readonly context: HrmsContextService) {}

  private invalidField(field: string, message: string): never {
    throw new BadRequestException({ message, errors: { [field]: [message] } });
  }

  /** Who the caller may see: CEO/COO everyone, a manager people on projects they manage. */
  private visibleTo(p: HrmsPrincipal, alias = 'm'): SQL {
    const m = sql.raw(alias);
    if (p.role === 'ceo' || p.role === 'coo') return sql`true`;
    if (p.role === 'manager') {
      return sql`(${m}.id = ${p.memberId} or exists (
        select 1 from project_members a
          join project_members b on b.project_id = a.project_id and b.org_id = a.org_id
         where a.member_id = ${p.memberId} and a.role = 'manager' and a.removed_at is null
           and b.member_id = ${m}.id and b.removed_at is null))`;
    }
    return sql`${m}.id = ${p.memberId}`;
  }

  private async viewerZone(p: HrmsPrincipal): Promise<string> {
    const r = await this.context.tx.execute<{ tz: string }>(
      sql`select u.timezone as tz from users u where u.id = ${p.userId}`,
    );
    return r.rows[0]?.tz ?? 'UTC';
  }

  // ---- calendar -------------------------------------------------------
  async calendar(p: HrmsPrincipal, q: CalendarQueryDto) {
    const settings = await this.context.tx.execute<{
      tz: string;
      weekend_days: number[];
      org_created_on: string | null;
    }>(sql`
      select coalesce(u.timezone, 'UTC') as tz,
             coalesce(s.weekend_days, '{5,6}'::smallint[]) as weekend_days,
             (select to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD')
                from orgs o where o.id = current_org_id()) as org_created_on
        from users u
        left join org_settings s on s.org_id = current_org_id()
       where u.id = ${p.userId}`);
    const tz = settings.rows[0]?.tz ?? 'UTC';
    const weekendDays = settings.rows[0]?.weekend_days ?? [5, 6];
    const from = q.from ?? monthStart();
    const to =
      q.to ??
      (
        await this.context.tx.execute<{ d: string }>(
          sql`select (${from}::date + interval '1 month')::date::text as d`,
        )
      ).rows[0].d;

    const who: SQL[] = [];
    if (q.memberId) {
      const ok = await this.context.tx.execute(sql`
        select 1 from org_members m
         where m.id = ${q.memberId} and m.org_id = current_org_id() and ${this.visibleTo(p)}`);
      if (ok.rows.length === 0) throw new NotFoundException('Person not found.');
      who.push(sql`(e.member_id = ${q.memberId} or e.member_id is null)`);
    } else if (q.scope === 'team' && p.role !== 'employee') {
      who.push(sql`(e.member_id is null or exists (
        select 1 from org_members m where m.id = e.member_id and ${this.visibleTo(p)}))`);
    } else {
      who.push(sql`(e.member_id = ${p.memberId} or e.member_id is null)`);
    }

    const rows = await this.context.tx.execute<EventRow>(sql`
      select distinct on (e.kind, e.ref_id, e.member_id, e.starts_at)
             e.kind, e.ref_id, e.title, e.starts_at, e.ends_at, e.link, e.location,
             e.member_id, u.full_name,
             (e.kind in ('leave', 'holiday')) as all_day,
             case when e.kind in ('leave', 'holiday')
                  then (e.starts_at at time zone current_setting('TimeZone'))::date::text end as start_date,
             case when e.kind in ('leave', 'holiday')
                  then ((e.ends_at at time zone current_setting('TimeZone'))::date - 1)::text end as end_date,
             to_char(e.starts_at at time zone ${tz}::text, 'YYYY-MM-DD HH24:MI') as starts_local,
             to_char(e.ends_at at time zone ${tz}::text, 'YYYY-MM-DD HH24:MI') as ends_local,
             ${tz}::text as tz
        from v_calendar_events e
        left join org_members m on m.id = e.member_id
        left join users u on u.id = m.user_id
       where e.org_id = current_org_id() and ${sql.join(who, sql` and `)}
         and e.starts_at < ${to}::timestamptz and e.ends_at >= ${from}::timestamptz
       order by e.kind, e.ref_id, e.member_id, e.starts_at`);

    const items = rows.rows
      .map((r) => ({
        kind: r.kind,
        refId: r.ref_id,
        title: r.title,
        startsAt: iso(r.starts_at),
        endsAt: iso(r.ends_at),
        startsAtLocal: r.starts_local,
        endsAtLocal: r.ends_local,
        allDay: r.all_day,
        startDate: r.start_date,
        endDate: r.end_date,
        link: r.link,
        location: r.location,
        member: r.member_id ? { id: r.member_id, fullName: r.full_name } : null,
      }))
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    return {
      timezone: tz,
      weekendDays,
      orgCreatedOn: settings.rows[0]?.org_created_on ?? null,
      from,
      to,
      items,
    };
  }

  // ---- meetings -------------------------------------------------------
  private checkPlace(link: string | null | undefined, location: string | null | undefined): void {
    const n = [link, location].filter((x) => x !== null && x !== undefined && x !== '').length;
    if (n !== 1) {
      this.invalidField(
        link ? 'location' : 'meetingLink',
        'Provide exactly one meeting link or location.',
      );
    }
  }

  async createMeeting(p: HrmsPrincipal, dto: CreateMeetingDto) {
    if (!dto.title.trim()) this.invalidField('title', 'Enter a meeting title.');
    this.checkPlace(dto.meetingLink, dto.location);
    const start = new Date(dto.startsAt).getTime();
    const end = new Date(dto.endsAt).getTime();
    if (end <= start) this.invalidField('endsAt', 'End time must be after the start time.');
    if (start < Date.now() - 5 * 60_000) {
      this.invalidField('startsAt', 'Choose a start time from now on.');
    }
    if (end - start > 24 * 3_600_000) {
      this.invalidField('endsAt', 'A meeting cannot be longer than 24 hours.');
    }
    const tx = this.context.tx;
    const created = await tx.execute<{ id: string }>(sql`
      insert into meetings (org_id, title, description, starts_at, ends_at, meeting_link, location, project_id, created_by)
      values (current_org_id(), ${dto.title.trim()}, ${dto.description ?? null}, ${dto.startsAt}::timestamptz,
              ${dto.endsAt}::timestamptz, ${dto.meetingLink ?? null}, ${dto.location ?? null},
              ${dto.projectId ?? null}, ${p.memberId})
      returning id`);
    const id = created.rows[0].id;
    for (const memberId of dto.inviteeIds) {
      await tx.execute(sql`
        insert into meeting_invitees (org_id, meeting_id, member_id)
        values (current_org_id(), ${id}, ${memberId})`);
    }
    return this.getMeeting(p, id);
  }

  async updateMeeting(p: HrmsPrincipal, id: string, dto: UpdateMeetingDto) {
    const tx = this.context.tx;
    const cur = await this.ownMeeting(p, id);
    const link =
      dto.meetingLink !== undefined ? dto.meetingLink : dto.location ? null : cur.meeting_link;
    const location =
      dto.location !== undefined ? dto.location : dto.meetingLink ? null : cur.location;
    this.checkPlace(link, location);
    const startsAt = dto.startsAt ?? cur.starts_at;
    const endsAt = dto.endsAt ?? cur.ends_at;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      if (new Date(endsAt) <= new Date(startsAt))
        this.invalidField('endsAt', 'End time must be after the start time.');
      if (new Date(endsAt).getTime() - new Date(startsAt).getTime() > 24 * 3_600_000)
        this.invalidField('endsAt', 'A meeting cannot be longer than 24 hours.');
    }

    await tx.execute(sql`
      update meetings
         set title = ${dto.title?.trim() ?? cur.title}, description = ${dto.description ?? cur.description},
             starts_at = ${startsAt}::timestamptz, ends_at = ${endsAt}::timestamptz,
             meeting_link = ${link}, location = ${location}
       where id = ${id} and org_id = current_org_id()`);

    if (dto.inviteeIds) {
      for (const memberId of dto.inviteeIds) {
        await tx.execute(sql`
          insert into meeting_invitees (org_id, meeting_id, member_id)
          values (current_org_id(), ${id}, ${memberId}) on conflict do nothing`);
      }
      await tx.execute(sql`
        delete from meeting_invitees
         where meeting_id = ${id} and org_id = current_org_id()
           and member_id <> all (${sql.raw(`array[${dto.inviteeIds.map((x) => `'${x}'`).join(',')}]::uuid[]`)})`);
    }
    return this.getMeeting(p, id);
  }

  async cancelMeeting(p: HrmsPrincipal, id: string) {
    await this.ownMeeting(p, id);
    await this.context.tx.execute(sql`
      update meetings set cancelled_at = now()
       where id = ${id} and org_id = current_org_id() and cancelled_at is null`);
    return this.getMeeting(p, id);
  }

  async respond(p: HrmsPrincipal, id: string, response: 'accepted' | 'declined') {
    const r = await this.context.tx.execute(sql`
      update meeting_invitees set response = ${response}::rsvp_status
       where meeting_id = ${id} and member_id = ${p.memberId} and org_id = current_org_id()
      returning member_id`);
    if (r.rows.length === 0) throw new NotFoundException('You are not invited to this meeting.');
    return this.getMeeting(p, id);
  }

  async getMeeting(p: HrmsPrincipal, id: string) {
    const tz = await this.viewerZone(p);
    const r = await this.context.tx.execute<MeetingRow>(sql`
      select mt.id, mt.title, mt.description, mt.starts_at, mt.ends_at, mt.meeting_link, mt.location,
             mt.project_id, mt.created_by, uc.full_name as created_by_name, mt.cancelled_at,
             coalesce((select json_agg(json_build_object('memberId', mi.member_id, 'fullName', u.full_name,
                                                         'response', mi.response::text) order by u.full_name)
                         from meeting_invitees mi join org_members om on om.id = mi.member_id
                         join users u on u.id = om.user_id where mi.meeting_id = mt.id), '[]'::json) as invitees,
             to_char(mt.starts_at at time zone ${tz}::text, 'YYYY-MM-DD HH24:MI') as starts_local,
             to_char(mt.ends_at at time zone ${tz}::text, 'YYYY-MM-DD HH24:MI') as ends_local,
             ${tz}::text as tz
        from meetings mt
        join org_members cm on cm.id = mt.created_by
        join users uc on uc.id = cm.user_id
       where mt.id = ${id} and mt.org_id = current_org_id()
         and (mt.created_by = ${p.memberId}
              or exists (select 1 from meeting_invitees i where i.meeting_id = mt.id and i.member_id = ${p.memberId})
              or ${p.role === 'ceo' || p.role === 'coo'})`);
    const m = r.rows[0];
    if (!m) throw new NotFoundException('Meeting not found.');
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      startsAt: iso(m.starts_at),
      endsAt: iso(m.ends_at),
      startsAtLocal: m.starts_local,
      endsAtLocal: m.ends_local,
      timezone: m.tz,
      meetingLink: m.meeting_link,
      location: m.location,
      projectId: m.project_id,
      createdBy: { id: m.created_by, fullName: m.created_by_name },
      cancelled: m.cancelled_at !== null,
      invitees: m.invitees,
      canEdit: m.created_by === p.memberId && m.cancelled_at === null,
    };
  }

  private async ownMeeting(p: HrmsPrincipal, id: string): Promise<MeetingRow> {
    const r = await this.context.tx.execute<MeetingRow>(sql`
      select id, title, description, starts_at, ends_at, meeting_link, location, created_by, cancelled_at
        from meetings where id = ${id} and org_id = current_org_id()`);
    const m = r.rows[0];
    if (!m) throw new NotFoundException('Meeting not found.');
    if (m.created_by !== p.memberId)
      throw new ForbiddenException('Only the person who created the meeting can change it.');
    if (m.cancelled_at) throw new BadRequestException('This meeting is cancelled.');
    return m;
  }

  // ---- workload -------------------------------------------------------
  async workload(p: HrmsPrincipal) {
    const r = await this.context.tx.execute<{
      member_id: string;
      full_name: string;
      role: string;
      open_tasks: number;
      active_projects: number;
      level: string;
      on_leave_until: string | null;
    }>(sql`
      select w.member_id, u.full_name, m.role::text as role, w.open_tasks::int as open_tasks,
             w.active_projects::int as active_projects, w.level, w.on_leave_until::text as on_leave_until
        from v_member_workload w
        join org_members m on m.id = w.member_id
        join users u on u.id = m.user_id
       where w.org_id = current_org_id() and ${this.visibleTo(p)}
       order by u.full_name`);
    return {
      items: r.rows.map((w) => ({
        memberId: w.member_id,
        fullName: w.full_name,
        role: w.role,
        openTasks: w.open_tasks,
        activeProjects: w.active_projects,
        level: w.level,
        onLeaveUntil: w.on_leave_until,
      })),
    };
  }
}
