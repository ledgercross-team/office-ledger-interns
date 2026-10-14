import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { mapDatabaseError } from '../hrms-error.filter';
import { iso } from '../hrms-rows';
import { AttendanceService } from '../attendance/attendance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MembersService } from '../members/members.service';
import type { BulkRequestsDto, FileRequestDto, ListRequestsQueryDto } from './dto/requests.dto';

const DEFAULT_PAGE_SIZE = 25;

interface RequestRow extends Record<string, unknown> {
  id: string;
  type: string;
  status: string;
  requested_by: string;
  requester_name: string;
  requester_role: string;
  project_id: string | null;
  project_name: string | null;
  subject_member_id: string | null;
  subject_name: string | null;
  task_id: string | null;
  task_title: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  decided_by: string | null;
  decider_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_at: string | null;
  expires_at: string;
  created_at: string;
  block_reason: string | null;
}

// block_reason is the database's own answer to "why can I not decide this?" for the viewer.
const REQUEST_SELECT = (viewer: string | null) => sql`
  select r.id, r.type::text as type, r.status::text as status,
         r.requested_by, ur.full_name as requester_name, mr.role::text as requester_role,
         r.project_id, p.name as project_name,
         r.subject_member_id, us.full_name as subject_name,
         r.task_id, t.title as task_title,
         r.payload, r.reason,
         r.decided_by, ud.full_name as decider_name, r.decided_at, r.decision_reason,
         r.applied_at, r.expires_at, r.created_at,
         case when r.status = 'pending' then request_decider_error(r, ${viewer}) end as block_reason
    from requests r
    join org_members mr on mr.id = r.requested_by
    join users ur on ur.id = mr.user_id
    left join projects p on p.id = r.project_id
    left join org_members ms on ms.id = r.subject_member_id
    left join users us on us.id = ms.user_id
    left join tasks t on t.id = r.task_id
    left join org_members md on md.id = r.decided_by
    left join users ud on ud.id = md.user_id`;

function toRequest(r: RequestRow, viewer: string | null) {
  const pending = r.status === 'pending';
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    requestedBy: { id: r.requested_by, fullName: r.requester_name, role: r.requester_role },
    project: r.project_id ? { id: r.project_id, name: r.project_name } : null,
    subject: r.subject_member_id ? { id: r.subject_member_id, fullName: r.subject_name } : null,
    task: r.task_id ? { id: r.task_id, title: r.task_title } : null,
    payload: r.payload,
    reason: r.reason,
    decidedBy: r.decided_by ? { id: r.decided_by, fullName: r.decider_name } : null,
    decidedAt: iso(r.decided_at),
    decisionReason: r.decision_reason,
    appliedAt: iso(r.applied_at),
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
    canDecide: pending && r.block_reason === null,
    cannotDecideBecause: pending ? r.block_reason : null,
    canCancel: (pending || r.status === 'approved') && r.requested_by === viewer,
  };
}

function dedupeKey(parts: Array<string | null | undefined>): string {
  return parts.map((x) => (x ?? '').toLowerCase()).join('|');
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly members: MembersService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(p: HrmsPrincipal, q: ListRequestsQueryDto) {
    const tx = this.context.tx;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: SQL[] = [sql`r.org_id = current_org_id()`];

    if ((q.scope ?? 'mine') === 'mine') {
      where.push(sql`r.requested_by = ${p.memberId}`);
    } else {
      where.push(sql`r.status = 'pending'`, sql`request_decider_error(r, ${p.memberId}) is null`);
    }
    if (q.status) where.push(sql`r.status = ${q.status}::request_status`);
    if (q.type) where.push(sql`r.type::text = ${q.type}`);
    if (q.projectId) where.push(sql`r.project_id = ${q.projectId}`);
    if (q.requesterId) where.push(sql`r.requested_by = ${q.requesterId}`);
    const cond = sql.join(where, sql` and `);

    const total = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from requests r where ${cond}`,
    );
    const rows = await tx.execute<RequestRow>(sql`
      ${REQUEST_SELECT(p.memberId)}
       where ${cond}
       order by (r.status = 'pending') desc, r.created_at desc
       limit ${pageSize} offset ${(page - 1) * pageSize}`);
    return {
      items: rows.rows.map((r) => toRequest(r, p.memberId)),
      total: total.rows[0].n,
      page,
      pageSize,
    };
  }

  async get(p: HrmsPrincipal, id: string) {
    const r = await this.context.tx.execute<RequestRow>(sql`
      ${REQUEST_SELECT(p.memberId)} where r.id = ${id} and r.org_id = current_org_id()`);
    if (!r.rows[0]) throw new NotFoundException('Request not found.');
    return toRequest(r.rows[0], p.memberId);
  }

  async file(p: HrmsPrincipal, dto: FileRequestDto) {
    const tx = this.context.tx;
    const payload: Record<string, unknown> = {};
    let key: string;

    if (dto.type === 'create_user') {
      const email = dto.email!.trim().toLowerCase();
      Object.assign(payload, { email, full_name: dto.fullName!.trim(), role: dto.role });
      key = dedupeKey([dto.type, email]);
    } else if (dto.type === 'create_project') {
      const name = dto.name!.trim();
      Object.assign(payload, {
        name,
        description: dto.description ?? null,
        start_date: dto.startDate ?? null,
        due_date: dto.dueDate ?? null,
        manager_ids: dto.managerIds ?? [],
      });
      key = dedupeKey([dto.type, name]);
    } else {
      key = dedupeKey([dto.type, dto.projectId, dto.subjectMemberId, dto.taskId]);
    }

    // Identical pending requests merge: the unique index is on (org, dedupe_key) while pending.
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into requests (org_id, type, requested_by, project_id, subject_member_id, task_id,
                            payload, reason, dedupe_key, expires_at)
      values (current_org_id(), ${dto.type}::request_type, ${p.memberId}, ${dto.projectId ?? null},
              ${dto.subjectMemberId ?? null}, ${dto.taskId ?? null},
              ${JSON.stringify(payload)}::jsonb, ${dto.reason?.trim() || null}, ${key}, now())
      on conflict (org_id, dedupe_key) where status = 'pending' and dedupe_key is not null do nothing
      returning id`);

    let merged = false;
    let id = inserted.rows[0]?.id;
    if (!id) {
      merged = true;
      const existing = await tx.execute<{ id: string }>(sql`
        select id from requests
         where org_id = current_org_id() and dedupe_key = ${key} and status = 'pending'`);
      id = existing.rows[0]?.id;
      if (!id) throw new NotFoundException('Request not found.');
    }
    if (!merged)
      await this.notifications.notifyDeciders(
        id,
        'A request is waiting for your decision',
        key.split('|')[0].replace(/_/g, ' '),
      );
    return { request: await this.get(p, id), merged };
  }

  async approve(p: HrmsPrincipal, id: string) {
    const row = await this.load(id);
    await this.context.tx.execute(
      sql`update requests set status = 'approved' where id = ${id} and org_id = current_org_id()`,
    );
    await this.apply(p, row);
    await this.tellRequester(row, 'approved');
    return this.get(p, id);
  }

  async reject(p: HrmsPrincipal, id: string, reason: string | undefined) {
    const text = reason?.trim() ?? '';
    if (text.length === 0)
      throw new BadRequestException('A reason is required to reject a request.');
    await this.load(id);
    await this.context.tx.execute(sql`
      update requests set status = 'rejected', decision_reason = ${text}
       where id = ${id} and org_id = current_org_id()`);
    const row = await this.load(id);
    await this.tellRequester(row, 'rejected');
    return this.get(p, id);
  }

  async cancel(p: HrmsPrincipal, id: string) {
    await this.load(id);
    await this.context.tx.execute(
      sql`update requests set status = 'cancelled' where id = ${id} and org_id = current_org_id()`,
    );
    return this.get(p, id);
  }

  /** Each request runs in its own savepoint, so one refusal does not undo the others. */
  async bulk(p: HrmsPrincipal, dto: BulkRequestsDto) {
    const tx = this.context.tx;
    if (dto.decision === 'reject' && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required to reject requests.');
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const [i, id] of dto.ids.entries()) {
      const sp = sql.raw(`bulk_${i}`);
      await tx.execute(sql`savepoint ${sp}`);
      try {
        if (dto.decision === 'approve') await this.approve(p, id);
        else await this.reject(p, id, dto.reason);
        await tx.execute(sql`release savepoint ${sp}`);
        results.push({ id, ok: true });
      } catch (error) {
        await tx.execute(sql`rollback to savepoint ${sp}`);
        const message =
          error instanceof NotFoundException || error instanceof BadRequestException
            ? error.message
            : (mapDatabaseError(error)?.message ?? 'Could not be decided.');
        results.push({ id, ok: false, error: message });
      }
    }
    return { results };
  }

  // ---- apply step -----------------------------------------------------
  // Runs in the approver's transaction: if it fails, the approval is undone with it.
  // create_task, assign_task, add_to_project and add_and_assign are done by the requester
  // afterwards and pass the request id (the task and invite code mark the request applied).
  private async apply(p: HrmsPrincipal, r: RequestRow): Promise<void> {
    const tx = this.context.tx;

    if (r.type === 'create_user') {
      const payload = r.payload as {
        email: string;
        full_name: string;
        role: 'manager' | 'employee';
      };
      await this.members.create(
        p,
        { email: payload.email, fullName: payload.full_name, role: payload.role },
        { issuePassword: false },
      );
    } else if (r.type === 'create_project') {
      const payload = r.payload as {
        name: string;
        description?: string | null;
        start_date?: string | null;
        due_date?: string | null;
        manager_ids?: string[];
      };
      const created = await tx.execute<{ id: string }>(sql`
        insert into projects (org_id, name, description, start_date, due_date, created_by, created_via_request)
        values (current_org_id(), ${payload.name}, ${payload.description ?? null},
                ${payload.start_date ?? null}::date, ${payload.due_date ?? null}::date, ${p.memberId}, ${r.id})
        returning id`);
      for (const managerId of payload.manager_ids ?? []) {
        await tx.execute(sql`
          insert into project_members (org_id, project_id, member_id, role)
          values (current_org_id(), ${created.rows[0].id}, ${managerId}, 'manager')`);
      }
    } else if (r.type === 'attendance_correction') {
      await this.attendance.applyCorrection(r.id);
    } else {
      return;
    }

    await tx.execute(
      sql`update requests set status = 'applied' where id = ${r.id} and org_id = current_org_id()`,
    );
  }

  private async tellRequester(r: RequestRow, outcome: 'approved' | 'rejected'): Promise<void> {
    await this.notifications.notify([r.requested_by], {
      kind: 'request_decided',
      entityTable: 'requests',
      entityId: r.id,
      title: `Your ${r.type.replace(/_/g, ' ')} request was ${outcome}`,
    });
  }

  private async load(id: string): Promise<RequestRow> {
    const r = await this.context.tx.execute<RequestRow>(sql`
      select r.*, r.type::text as type, r.status::text as status
        from requests r where r.id = ${id} and r.org_id = current_org_id()`);
    if (!r.rows[0]) throw new NotFoundException('Request not found.');
    return r.rows[0];
  }
}
