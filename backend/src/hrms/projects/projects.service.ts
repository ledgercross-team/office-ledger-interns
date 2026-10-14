import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type {
  AddProjectMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  SetLeadDto,
  UpdateProjectDto,
} from './dto/projects.dto';

const DEFAULT_PAGE_SIZE = 25;

interface ProjectRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  created_by: string;
  completion_requested_at: string | null;
  completed_at: string | null;
  rating_closes_at: string | null;
  archived_at: string | null;
  created_at: string;
  manager_count: number | null;
  employee_count: number | null;
  lead_count: number | null;
  done_tasks: number | null;
  counted_tasks: number | null;
  percent_done: string | null;
  my_role: string | null;
  i_am_lead: boolean | null;
}

// v_project_flags only lists active and pending projects, and v_project_progress every one,
// so both are left-joined.
const PROJECT_SELECT = (memberId: string | null) => sql`
  select p.id, p.name, p.description, p.status::text as status,
         to_char(p.start_date, 'YYYY-MM-DD') as start_date, to_char(p.due_date, 'YYYY-MM-DD') as due_date,
         p.created_by, p.completion_requested_at, p.completed_at, p.rating_closes_at, p.archived_at,
         p.created_at,
         f.manager_count::int, f.employee_count::int, f.lead_count::int,
         g.done_tasks::int, g.counted_tasks::int, g.percent_done::text,
         (select pm.role::text from project_members pm
           where pm.project_id = p.id and pm.member_id = ${memberId} and pm.removed_at is null) as my_role,
         (select pm.is_lead from project_members pm
           where pm.project_id = p.id and pm.member_id = ${memberId} and pm.removed_at is null) as i_am_lead
    from projects p
    left join v_project_flags f on f.project_id = p.id
    left join v_project_progress g on g.project_id = p.id`;

function toProject(r: ProjectRow) {
  const open = r.status === 'active' || r.status === 'pending_lead_approval';
  const managers = r.manager_count ?? 0;
  const employees = r.employee_count ?? 0;
  const counted = r.counted_tasks ?? 0;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    startDate: r.start_date,
    dueDate: r.due_date,
    createdBy: r.created_by,
    completionRequestedAt: iso(r.completion_requested_at),
    completedAt: iso(r.completed_at),
    ratingClosesAt: iso(r.rating_closes_at),
    archivedAt: iso(r.archived_at),
    createdAt: iso(r.created_at),
    managerCount: managers,
    employeeCount: employees,
    leadCount: r.lead_count ?? 0,
    // Plan section 2: "No manager" / "No employee", for projects still in play.
    flags: { noManager: open && managers === 0, noEmployee: open && employees === 0 },
    // Plan section 5: cancelled tasks count neither way; no tasks shows "No tasks yet".
    progress: {
      doneTasks: r.done_tasks ?? 0,
      countedTasks: counted,
      percentDone: counted === 0 || r.percent_done === null ? null : Number(r.percent_done),
    },
    myRole: r.my_role,
    iAmLead: r.i_am_lead === true,
  };
}

function isCeoOrCoo(p: HrmsPrincipal): boolean {
  return p.role === 'ceo' || p.role === 'coo';
}

@Injectable()
export class ProjectsService {
  constructor(private readonly context: HrmsContextService) {}

  /** CEO/COO: every project. Others: projects they are on, plus all if their switch is on. */
  private visibleTo(p: HrmsPrincipal): SQL {
    if (isCeoOrCoo(p)) return sql`true`;
    const member = sql`exists (select 1 from project_members pm
        where pm.project_id = p.id and pm.member_id = ${p.memberId} and pm.removed_at is null)`;
    if (p.role === 'manager') {
      return sql`(${member} or coalesce((select can_view_all_projects from org_members
                                          where id = ${p.memberId}), false))`;
    }
    return member;
  }

  async list(p: HrmsPrincipal, query: ListProjectsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filters: SQL[] = [sql`p.org_id = current_org_id()`, this.visibleTo(p)];
    filters.push(
      query.status ? sql`p.status = ${query.status}::project_status` : sql`p.status <> 'archived'`,
    );
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(sql`p.name ilike ${like}`);
    }
    const where = sql.join(filters, sql` and `);

    const tx = this.context.tx;
    const total = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from projects p where ${where}`,
    );
    const rows = await tx.execute<ProjectRow>(sql`
      ${PROJECT_SELECT(p.memberId)}
      where ${where}
      order by case p.status when 'active' then 0 when 'pending_lead_approval' then 1
                             when 'completed' then 2 else 3 end, p.due_date nulls last, p.name
      limit ${pageSize} offset ${(page - 1) * pageSize}`);
    return { items: rows.rows.map(toProject), page, pageSize, total: total.rows[0].n };
  }

  private async findRow(p: HrmsPrincipal, id: string): Promise<ProjectRow | undefined> {
    const rows = await this.context.tx.execute<ProjectRow>(sql`
      ${PROJECT_SELECT(p.memberId)}
      where p.id = ${id} and p.org_id = current_org_id() and ${this.visibleTo(p)}`);
    return rows.rows[0];
  }

  async get(p: HrmsPrincipal, id: string) {
    const row = await this.findRow(p, id);
    if (!row) throw new NotFoundException('Project not found.');

    const members = await this.context.tx.execute<{
      id: string;
      member_id: string;
      full_name: string;
      designation: string | null;
      role: string;
      is_lead: boolean;
      added_at: string;
      ticked_at: string | null;
    }>(sql`
      select pm.id, pm.member_id, u.full_name, om.designation, pm.role::text as role, pm.is_lead,
             pm.added_at, t.ticked_at
        from project_members pm
        join org_members om on om.id = pm.member_id
        join users u on u.id = om.user_id
        left join project_completion_ticks t
               on t.project_id = pm.project_id and t.member_id = pm.member_id
       where pm.project_id = ${id} and pm.removed_at is null
       order by pm.role, pm.is_lead desc, u.full_name`);

    const managers = members.rows.filter((m) => m.role === 'manager');
    const ticked = managers.filter((m) => m.ticked_at !== null).length;
    return {
      ...toProject(row),
      members: members.rows.map((m) => ({
        id: m.id,
        memberId: m.member_id,
        fullName: m.full_name,
        designation: m.designation,
        role: m.role,
        isLead: m.is_lead,
        addedAt: iso(m.added_at),
        ticked: m.role === 'manager' ? m.ticked_at !== null : null,
      })),
      completion: {
        managersTotal: managers.length,
        managersTicked: ticked,
        // With no lead, the CEO or COO approves.
        approver: row.lead_count && row.lead_count > 0 ? 'lead' : 'ceo_or_coo',
      },
    };
  }

  async create(p: HrmsPrincipal, dto: CreateProjectDto) {
    const tx = this.context.tx;
    const created = await tx.execute<{ id: string }>(sql`
      insert into projects (org_id, name, description, start_date, due_date, created_by)
      values (current_org_id(), ${dto.name.trim()}, ${dto.description ?? null},
              ${dto.startDate ?? null}::date, ${dto.dueDate ?? null}::date, ${p.memberId})
      returning id`);
    const id = created.rows[0].id;

    for (const managerId of dto.managerIds ?? []) {
      await tx.execute(sql`
        insert into project_members (org_id, project_id, member_id, role)
        values (current_org_id(), ${id}, ${managerId}, 'manager')`);
    }
    return this.get(p, id);
  }

  async update(p: HrmsPrincipal, id: string, dto: UpdateProjectDto) {
    const row = await this.findRow(p, id);
    if (!row) throw new NotFoundException('Project not found.');
    await this.assertCeoCooOrLead(p, id, 'Only the CEO, COO or a project lead can edit a project.');

    const sets: SQL[] = [];
    if (dto.name !== undefined) sets.push(sql`name = ${dto.name.trim()}`);
    if (dto.description !== undefined) sets.push(sql`description = ${dto.description}`);
    if (dto.startDate !== undefined) sets.push(sql`start_date = ${dto.startDate}::date`);
    if (dto.dueDate !== undefined) sets.push(sql`due_date = ${dto.dueDate}::date`);
    if (sets.length === 0) throw new BadRequestException('Nothing to change.');

    await this.context.tx.execute(
      sql`update projects set ${sql.join(sets, sql`, `)} where id = ${id} and org_id = current_org_id()`,
    );
    return this.get(p, id);
  }

  async archive(p: HrmsPrincipal, id: string) {
    await this.requireVisible(p, id);
    // The database cancels the project's open tasks (trg_project_archived).
    await this.context.tx.execute(sql`
      update projects set status = 'archived', archived_by = ${p.memberId}
       where id = ${id} and org_id = current_org_id()`);
    return this.get(p, id);
  }

  async reopen(p: HrmsPrincipal, id: string) {
    const row = await this.requireVisible(p, id);
    if (row.status !== 'completed') {
      throw new ConflictException('Only a completed project can be reopened.');
    }
    await this.setStatus(id, 'active');
    return this.get(p, id);
  }

  // ---- members and lead tag ------------------------------------------
  async addMember(p: HrmsPrincipal, id: string, dto: AddProjectMemberDto) {
    await this.requireVisible(p, id);
    const target = await this.context.tx.execute<{ role: string }>(
      sql`select role::text as role from org_members
           where id = ${dto.memberId} and org_id = current_org_id() and status = 'active'`,
    );
    const role = target.rows[0]?.role;
    if (!role) throw new NotFoundException('Member not found.');
    if (role !== 'manager') {
      throw new BadRequestException(
        'Employees join a project through an invite. Managers can be added directly.',
      );
    }
    if (dto.isLead && !isCeoOrCoo(p)) {
      throw new ForbiddenException('Only the CEO or COO can tag a project lead.');
    }

    await this.context.tx.execute(sql`
      insert into project_members (org_id, project_id, member_id, role, is_lead, lead_tagged_by)
      values (current_org_id(), ${id}, ${dto.memberId}, 'manager', ${dto.isLead === true},
              ${dto.isLead ? p.memberId : null})`);
    return this.get(p, id);
  }

  async removeMember(p: HrmsPrincipal, id: string, memberId: string) {
    await this.requireVisible(p, id);
    await this.assertCeoCooOrLead(
      p,
      id,
      'Only the CEO, COO or a project lead can remove someone from a project.',
    );
    const r = await this.context.tx.execute(sql`
      update project_members set removed_at = now(), removed_by = ${p.memberId}
       where project_id = ${id} and member_id = ${memberId} and org_id = current_org_id()
         and removed_at is null
       returning id`);
    if (r.rows.length === 0) throw new NotFoundException('That person is not on this project.');
    return this.get(p, id);
  }

  async setLead(p: HrmsPrincipal, id: string, memberId: string, dto: SetLeadDto) {
    await this.requireVisible(p, id);
    const r = await this.context.tx.execute(sql`
      update project_members set is_lead = ${dto.isLead}
       where project_id = ${id} and member_id = ${memberId} and org_id = current_org_id()
         and removed_at is null
       returning id`);
    if (r.rows.length === 0) throw new NotFoundException('That manager is not on this project.');
    return this.get(p, id);
  }

  // ---- completion -----------------------------------------------------
  async tick(p: HrmsPrincipal, id: string) {
    await this.requireVisible(p, id);
    // The database checks: a manager on the project, every task Done or Cancelled, at least
    // one Done. When the last manager ticks, it moves the project to lead approval itself.
    await this.context.tx.execute(sql`
      insert into project_completion_ticks (org_id, project_id, member_id)
      values (current_org_id(), ${id}, ${p.memberId})`);
    return this.get(p, id);
  }

  async complete(p: HrmsPrincipal, id: string) {
    const row = await this.requireVisible(p, id);
    if (row.status !== 'pending_lead_approval') {
      throw new ConflictException('Every manager must tick the project before it can be completed.');
    }
    await this.setStatus(id, 'completed');
    return this.get(p, id);
  }

  async sendBack(p: HrmsPrincipal, id: string) {
    const row = await this.requireVisible(p, id);
    if (row.status !== 'pending_lead_approval') {
      throw new ConflictException('This project is not waiting for approval.');
    }
    await this.setStatus(id, 'active');
    return this.get(p, id);
  }

  // ---- helpers --------------------------------------------------------
  private async setStatus(id: string, status: 'active' | 'completed'): Promise<void> {
    await this.context.tx.execute(sql`
      update projects set status = ${status}::project_status
       where id = ${id} and org_id = current_org_id()`);
  }

  private async requireVisible(p: HrmsPrincipal, id: string): Promise<ProjectRow> {
    const row = await this.findRow(p, id);
    if (!row) throw new NotFoundException('Project not found.');
    return row;
  }

  private async assertCeoCooOrLead(p: HrmsPrincipal, id: string, message: string): Promise<void> {
    if (isCeoOrCoo(p)) return;
    const r = await this.context.tx.execute<{ ok: boolean }>(
      sql`select is_project_lead(${id}::uuid, ${p.memberId}::uuid) as ok`,
    );
    if (!r.rows[0]?.ok) throw new ForbiddenException(message);
  }
}
