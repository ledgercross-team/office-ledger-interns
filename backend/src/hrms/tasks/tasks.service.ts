import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type {
  AddAssigneeDto,
  ChangeTaskStatusDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/tasks.dto';

const DEFAULT_PAGE_SIZE = 25;

interface TaskRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  project_name: string;
  project_status: string;
  title: string;
  description: string | null;
  status: string;
  urgency: string;
  due_at: string;
  status_comment: string | null;
  blocked_reason: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  no_manager: boolean | null;
  no_employee: boolean | null;
  no_assignee: boolean | null;
  overdue: boolean | null;
  my_assignment: string | null;
  assignees: Array<{ memberId: string; fullName: string; role: string }>;
}

// v_task_flags lists only open tasks, so it is left-joined: a closed task has no flags.
const TASK_SELECT = (memberId: string | null) => sql`
  select t.id, t.project_id, p.name as project_name, p.status::text as project_status,
         t.title, t.description, t.status::text as status, t.urgency::text as urgency, t.due_at,
         t.status_comment, t.blocked_reason, t.cancel_reason, t.completed_at, t.created_by, t.created_at,
         f.no_manager, f.no_employee, f.no_assignee, f.overdue,
         (select ta.role::text from task_assignees ta
           where ta.task_id = t.id and ta.member_id = ${memberId} and ta.removed_at is null) as my_assignment,
         coalesce((select json_agg(json_build_object(
                     'memberId', ta.member_id, 'fullName', u.full_name, 'role', ta.role::text)
                   order by ta.role, u.full_name)
                     from task_assignees ta
                     join org_members om on om.id = ta.member_id
                     join users u on u.id = om.user_id
                    where ta.task_id = t.id and ta.removed_at is null), '[]'::json) as assignees
    from tasks t
    join projects p on p.id = t.project_id
    left join v_task_flags f on f.task_id = t.id`;

function toTask(r: TaskRow) {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    projectStatus: r.project_status,
    title: r.title,
    description: r.description,
    status: r.status,
    urgency: r.urgency,
    dueAt: iso(r.due_at),
    statusComment: r.status_comment,
    blockedReason: r.blocked_reason,
    cancelReason: r.cancel_reason,
    completedAt: iso(r.completed_at),
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    assignees: r.assignees,
    flags: {
      noManager: r.no_manager === true,
      noEmployee: r.no_employee === true,
      noAssignee: r.no_assignee === true,
      overdue: r.overdue === true,
    },
    myAssignment: r.my_assignment,
  };
}

function isCeoOrCoo(p: HrmsPrincipal): boolean {
  return p.role === 'ceo' || p.role === 'coo';
}

@Injectable()
export class TasksService {
  constructor(private readonly context: HrmsContextService) {}

  /** CEO/COO: all. Manager: tasks of projects they are on (or all, with the switch) and their own. Employee: their own. */
  private visibleTo(p: HrmsPrincipal): SQL {
    if (isCeoOrCoo(p)) return sql`true`;
    const mine = sql`exists (select 1 from task_assignees ta
        where ta.task_id = t.id and ta.member_id = ${p.memberId} and ta.removed_at is null)`;
    if (p.role === 'manager') {
      return sql`(${mine}
        or exists (select 1 from project_members pm
                    where pm.project_id = t.project_id and pm.member_id = ${p.memberId}
                      and pm.removed_at is null)
        or coalesce((select can_view_all_projects from org_members where id = ${p.memberId}), false))`;
    }
    return mine;
  }

  async list(p: HrmsPrincipal, query: ListTasksQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filters: SQL[] = [sql`t.org_id = current_org_id()`, this.visibleTo(p)];
    if (query.projectId) filters.push(sql`t.project_id = ${query.projectId}`);
    if (query.status) filters.push(sql`t.status = ${query.status}::task_status`);
    if (query.urgency) filters.push(sql`t.urgency = ${query.urgency}::task_urgency`);
    if (query.open) filters.push(sql`t.status not in ('done', 'cancelled')`);
    if (query.mine) {
      filters.push(sql`exists (select 1 from task_assignees ta
        where ta.task_id = t.id and ta.member_id = ${p.memberId} and ta.removed_at is null)`);
    }
    if (query.flag === 'overdue') filters.push(sql`f.overdue`);
    if (query.flag === 'no_assignee') filters.push(sql`f.no_assignee`);
    if (query.flag === 'no_manager') filters.push(sql`f.no_manager`);
    if (query.flag === 'no_employee') filters.push(sql`f.no_employee`);
    const where = sql.join(filters, sql` and `);

    const tx = this.context.tx;
    const total = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from tasks t
        left join v_task_flags f on f.task_id = t.id where ${where}`);
    // Plan section 5: urgency first, then due date; closed tasks last.
    const rows = await tx.execute<TaskRow>(sql`
      ${TASK_SELECT(p.memberId)}
      where ${where}
      order by (t.status in ('done', 'cancelled')),
               case t.urgency when 'high' then 0 when 'medium' then 1 else 2 end,
               t.due_at, t.id
      limit ${pageSize} offset ${(page - 1) * pageSize}`);
    return { items: rows.rows.map(toTask), page, pageSize, total: total.rows[0].n };
  }

  private async findRow(p: HrmsPrincipal, id: string): Promise<TaskRow | undefined> {
    const rows = await this.context.tx.execute<TaskRow>(sql`
      ${TASK_SELECT(p.memberId)}
      where t.id = ${id} and t.org_id = current_org_id() and ${this.visibleTo(p)}`);
    return rows.rows[0];
  }

  async get(p: HrmsPrincipal, id: string) {
    const row = await this.findRow(p, id);
    if (!row) throw new NotFoundException('Task not found.');
    return toTask(row);
  }

  async create(p: HrmsPrincipal, projectId: string, dto: CreateTaskDto) {
    const tx = this.context.tx;
    const project = await tx.execute(
      sql`select 1 from projects where id = ${projectId} and org_id = current_org_id()`,
    );
    if (project.rows.length === 0) throw new NotFoundException('Project not found.');

    // The database checks the rest: project open, manager on it, approval switch and request.
    const created = await tx.execute<{ id: string }>(sql`
      insert into tasks (org_id, project_id, title, description, urgency, due_at, created_by, created_via_request)
      values (current_org_id(), ${projectId}, ${dto.title.trim()}, ${dto.description ?? null},
              ${dto.urgency}::task_urgency, ${dto.dueAt}::timestamptz, ${p.memberId},
              ${dto.requestId ?? null})
      returning id`);
    const id = created.rows[0].id;
    await this.markApplied(dto.requestId, ['create_task']);

    for (const memberId of dto.assigneeIds ?? []) {
      await this.insertAssignee(id, memberId, dto.assignRequestId ?? null, p.memberId);
    }
    return this.get(p, id);
  }

  async update(p: HrmsPrincipal, id: string, dto: UpdateTaskDto) {
    await this.requireVisible(p, id);
    const sets: SQL[] = [];
    if (dto.title !== undefined) sets.push(sql`title = ${dto.title.trim()}`);
    if (dto.description !== undefined) sets.push(sql`description = ${dto.description}`);
    if (dto.urgency !== undefined) sets.push(sql`urgency = ${dto.urgency}::task_urgency`);
    if (dto.dueAt !== undefined) sets.push(sql`due_at = ${dto.dueAt}::timestamptz`);
    if (sets.length === 0) throw new BadRequestException('Nothing to change.');

    await this.context.tx.execute(
      sql`update tasks set ${sql.join(sets, sql`, `)} where id = ${id} and org_id = current_org_id()`,
    );
    return this.get(p, id);
  }

  /** One endpoint for every transition. The database owns the graph and who may use each edge. */
  async changeStatus(p: HrmsPrincipal, id: string, dto: ChangeTaskStatusDto) {
    await this.requireVisible(p, id);
    const reason = dto.reason?.trim() ?? '';
    const comment = dto.comment?.trim() ?? '';

    if ((dto.status === 'blocked' || dto.status === 'cancelled') && reason.length === 0) {
      throw new BadRequestException(
        `A reason is required to ${dto.status === 'blocked' ? 'block' : 'cancel'} a task.`,
      );
    }
    const statusComment = reason || comment || null;

    await this.context.tx.execute(sql`
      update tasks
         set status = ${dto.status}::task_status,
             status_comment = ${statusComment},
             blocked_reason = ${dto.status === 'blocked' ? reason : null},
             cancel_reason  = ${dto.status === 'cancelled' ? reason : null}
       where id = ${id} and org_id = current_org_id()`);
    return this.get(p, id);
  }

  async addAssignee(p: HrmsPrincipal, id: string, dto: AddAssigneeDto) {
    await this.requireVisible(p, id);
    await this.insertAssignee(id, dto.memberId, dto.requestId ?? null, p.memberId);
    return this.get(p, id);
  }

  async removeAssignee(p: HrmsPrincipal, id: string, memberId: string) {
    await this.requireVisible(p, id);
    const r = await this.context.tx.execute(sql`
      update task_assignees set removed_at = now(), removed_by = ${p.memberId}
       where task_id = ${id} and member_id = ${memberId} and org_id = current_org_id()
         and removed_at is null
       returning id`);
    if (r.rows.length === 0) throw new NotFoundException('That person is not on this task.');
    return this.get(p, id);
  }

  async history(p: HrmsPrincipal, id: string) {
    await this.requireVisible(p, id);
    const r = await this.context.tx.execute<{
      id: string;
      from_status: string | null;
      to_status: string;
      comment: string | null;
      changed_by: string | null;
      changed_by_name: string | null;
      changed_at: string;
    }>(sql`
      select h.id::text as id, h.from_status::text as from_status, h.to_status::text as to_status,
             h.comment, h.changed_by, u.full_name as changed_by_name, h.changed_at
        from task_status_history h
        left join org_members om on om.id = h.changed_by
        left join users u on u.id = om.user_id
       where h.task_id = ${id} and h.org_id = current_org_id()
       order by h.changed_at, h.id`);
    return {
      items: r.rows.map((h) => ({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        comment: h.comment,
        changedBy: h.changed_by ? { id: h.changed_by, fullName: h.changed_by_name } : null,
        changedAt: iso(h.changed_at),
      })),
    };
  }

  // ---- helpers --------------------------------------------------------
  private async requireVisible(p: HrmsPrincipal, id: string): Promise<void> {
    if (!(await this.findRow(p, id))) throw new NotFoundException('Task not found.');
  }

  private async insertAssignee(
    taskId: string,
    memberId: string,
    requestId: string | null,
    actorId: string | null,
  ): Promise<void> {
    const target = await this.context.tx.execute<{ role: string }>(
      sql`select role::text as role from org_members
           where id = ${memberId} and org_id = current_org_id() and status = 'active'`,
    );
    const role = target.rows[0]?.role;
    if (!role) throw new NotFoundException('Member not found.');
    if (role !== 'manager' && role !== 'employee') {
      throw new BadRequestException('Only managers and employees can be assigned to a task.');
    }
    await this.context.tx.execute(sql`
      insert into task_assignees (org_id, task_id, member_id, role, assigned_by, assigned_via_request)
      values (current_org_id(), ${taskId}, ${memberId}, ${role}::project_role, ${actorId}, ${requestId})`);
    await this.markApplied(requestId ?? undefined, ['assign_task', 'add_and_assign']);
  }

  // The requester performs the action; the request is then done.
  private async markApplied(requestId: string | undefined, types: string[]): Promise<void> {
    if (!requestId) return;
    await this.context.tx.execute(sql`
      update requests set status = 'applied'
       where id = ${requestId} and org_id = current_org_id() and status = 'approved'
         and type::text in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`);
  }
}
