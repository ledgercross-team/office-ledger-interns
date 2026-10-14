import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser, Role } from '../../auth/auth.types';
import { getCompanyDate } from '../../common/utils/company-time';
import { isHoliday } from '../../common/utils/dates';
import { DRIZZLE, type Database } from '../../db/db.module';
import { companies, taskActivity, taskAssignmentRequests, tasks, users } from '../../db/schema';
import { managedPeople } from '../users/visibility';
import type {
  CommentDto,
  CreateTaskDto,
  ListAssignmentRequestsQueryDto,
  ListTasksQueryDto,
  StatusChangeDto,
  UpdateTaskDto,
} from './dto/tasks.dto';
import {
  allowedActions,
  commentRequired,
  denialFor,
  isTaskManager,
  nextStatus,
  type TaskAssignee,
  type TaskStatus,
} from './task-rules';

const assignee = aliasedTable(users, 'assignee');
const creator = aliasedTable(users, 'creator');
const requestManager = aliasedTable(users, 'request_manager');
const requestEmployee = aliasedTable(users, 'request_employee');
const employeeManager = aliasedTable(users, 'employee_manager');

const CLOSED: TaskStatus[] = ['done', 'cancelled'];

const TASK_COLUMNS = {
  id: tasks.id,
  companyId: tasks.companyId,
  title: tasks.title,
  description: tasks.description,
  category: tasks.category,
  priority: tasks.priority,
  status: tasks.status,
  deadline: tasks.deadline,
  assigneeId: tasks.assigneeId,
  assigneeName: assignee.fullName,
  assigneeRole: assignee.role,
  assigneeManagerId: assignee.managerId,
  createdById: tasks.createdById,
  creatorName: creator.fullName,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

interface TaskRow {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: (typeof tasks.category.enumValues)[number];
  priority: 'low' | 'medium' | 'high';
  status: TaskStatus;
  deadline: Date;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: Role;
  assigneeManagerId: string | null;
  createdById: string;
  creatorName: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function assigneeOf(task: TaskRow): TaskAssignee {
  return {
    role: task.assigneeRole,
    managerId: task.assigneeManagerId,
    taskManagerId: task.createdById,
  };
}

export interface TaskAssignmentRequestRow {
  id: string;
  companyId: string;
  managerId: string;
  managerName: string;
  employeeId: string;
  employeeName: string;
  employeeManagerName: string | null;
  title: string;
  description: string | null;
  category: (typeof tasks.category.enumValues)[number];
  priority: 'low' | 'medium' | 'high';
  deadline: Date;
  status: 'pending' | 'approved' | 'rejected';
  reviewedById: string | null;
  reviewedAt: Date | null;
  taskId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ASSIGNMENT_REQUEST_COLUMNS = {
  id: taskAssignmentRequests.id,
  companyId: taskAssignmentRequests.companyId,
  managerId: taskAssignmentRequests.managerId,
  managerName: requestManager.fullName,
  employeeId: taskAssignmentRequests.employeeId,
  employeeName: requestEmployee.fullName,
  employeeManagerName: employeeManager.fullName,
  title: taskAssignmentRequests.title,
  description: taskAssignmentRequests.description,
  category: taskAssignmentRequests.category,
  priority: taskAssignmentRequests.priority,
  deadline: taskAssignmentRequests.deadline,
  status: taskAssignmentRequests.status,
  reviewedById: taskAssignmentRequests.reviewedById,
  reviewedAt: taskAssignmentRequests.reviewedAt,
  taskId: taskAssignmentRequests.taskId,
  createdAt: taskAssignmentRequests.createdAt,
  updatedAt: taskAssignmentRequests.updatedAt,
};

@Injectable()
export class TasksService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async list(user: AuthUser, query: ListTasksQueryDto) {
    const where = and(
      eq(tasks.companyId, user.companyId as string),
      this.visibleTo(user),
      query.status ? eq(tasks.status, query.status) : undefined,
      query.category ? eq(tasks.category, query.category) : undefined,
      query.assigneeId ? eq(tasks.assigneeId, query.assigneeId) : undefined,
      query.dueBefore ? lt(tasks.deadline, new Date(query.dueBefore)) : undefined,
      query.overdue === true
        ? and(lt(tasks.deadline, new Date()), notInArray(tasks.status, CLOSED))
        : undefined,
    );

    const [{ total }] = await this.database
      .select({ total: count() })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(where);

    const rows = await this.baseSelect()
      .where(where)
      .orderBy(desc(tasks.priority), asc(tasks.deadline), asc(tasks.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      items: rows.map((row) => this.present(row, user)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: AuthUser, taskId: string) {
    return this.present(await this.findVisible(user, taskId), user);
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    this.assertNotInThePast(dto.deadline);
    await this.assertNotHoliday(user, dto.deadline);
    const target = await this.findAssignmentTarget(user, dto.assigneeId);

    if (!target) {
      throw new BadRequestException('Choose an active employee or manager from your company.');
    }

    // A manager may work with any employee, but an employee outside their own
    // team needs an admin approval before the task is created.
    if (user.role === 'manager' && target.managerId !== user.id) {
      const [created] = await this.database
        .insert(taskAssignmentRequests)
        .values({
          companyId: user.companyId as string,
          managerId: user.id,
          employeeId: target.id,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          deadline: new Date(dto.deadline),
        })
        .returning({ id: taskAssignmentRequests.id });

      return {
        status: 'pending_approval' as const,
        request: await this.loadAssignmentRequest(user.companyId as string, created.id),
      };
    }

    const [created] = await this.database
      .insert(tasks)
      .values({
        companyId: user.companyId as string,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        deadline: new Date(dto.deadline),
        assigneeId: dto.assigneeId,
        createdById: user.id,
      })
      .returning({ id: tasks.id });

    return this.get(user, created.id);
  }

  async listAssignmentRequests(user: AuthUser, query: ListAssignmentRequestsQueryDto) {
    this.assertAdmin(user);
    const status = query.status ?? 'pending';
    const where = and(
      eq(taskAssignmentRequests.companyId, user.companyId as string),
      eq(taskAssignmentRequests.status, status),
    );

    const [{ total }] = await this.database
      .select({ total: count() })
      .from(taskAssignmentRequests)
      .where(where);
    const rows = await this.assignmentRequestSelect()
      .where(where)
      .orderBy(asc(taskAssignmentRequests.createdAt), asc(taskAssignmentRequests.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return { items: rows, page: query.page, pageSize: query.pageSize, total };
  }

  async approveAssignment(user: AuthUser, requestId: string) {
    this.assertAdmin(user);
    const taskId = await this.database.transaction(async (tx) => {
      const [request] = await tx
        .select({
          id: taskAssignmentRequests.id,
          companyId: taskAssignmentRequests.companyId,
          managerId: taskAssignmentRequests.managerId,
          employeeId: taskAssignmentRequests.employeeId,
          title: taskAssignmentRequests.title,
          description: taskAssignmentRequests.description,
          category: taskAssignmentRequests.category,
          priority: taskAssignmentRequests.priority,
          deadline: taskAssignmentRequests.deadline,
        })
        .from(taskAssignmentRequests)
        .where(
          and(
            eq(taskAssignmentRequests.id, requestId),
            eq(taskAssignmentRequests.companyId, user.companyId as string),
            eq(taskAssignmentRequests.status, 'pending'),
          ),
        )
        .limit(1);

      if (!request) {
        throw new NotFoundException('Assignment request not found or already reviewed.');
      }

      this.assertNotInThePast(request.deadline.toISOString());
      await this.assertNotHoliday(user, request.deadline.toISOString());

      const people = await tx
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(
          and(
            eq(users.companyId, request.companyId),
            inArray(users.id, [request.managerId, request.employeeId]),
          ),
        );
      const manager = people.find((person) => person.id === request.managerId);
      const employee = people.find((person) => person.id === request.employeeId);
      if (!manager || manager.role !== 'manager' || !manager.isActive) {
        throw new ConflictException('The requesting manager is no longer active.');
      }
      if (!employee || employee.role !== 'employee' || !employee.isActive) {
        throw new ConflictException('The selected employee is no longer active.');
      }

      const [created] = await tx
        .insert(tasks)
        .values({
          companyId: request.companyId,
          title: request.title,
          description: request.description,
          category: request.category,
          priority: request.priority,
          deadline: request.deadline,
          assigneeId: request.employeeId,
          createdById: request.managerId,
        })
        .returning({ id: tasks.id });

      const reviewed = await tx
        .update(taskAssignmentRequests)
        .set({ status: 'approved', reviewedById: user.id, reviewedAt: new Date(), taskId: created.id })
        .where(
          and(
            eq(taskAssignmentRequests.id, request.id),
            eq(taskAssignmentRequests.status, 'pending'),
          ),
        )
        .returning({ id: taskAssignmentRequests.id });

      if (reviewed.length === 0) {
        throw new ConflictException('This assignment request was already reviewed.');
      }
      return created.id;
    });

    return this.get(user, taskId);
  }

  async rejectAssignment(user: AuthUser, requestId: string) {
    this.assertAdmin(user);
    const [rejected] = await this.database
      .update(taskAssignmentRequests)
      .set({ status: 'rejected', reviewedById: user.id, reviewedAt: new Date() })
      .where(
        and(
          eq(taskAssignmentRequests.id, requestId),
          eq(taskAssignmentRequests.companyId, user.companyId as string),
          eq(taskAssignmentRequests.status, 'pending'),
        ),
      )
      .returning({ id: taskAssignmentRequests.id, status: taskAssignmentRequests.status });

    if (!rejected) {
      throw new NotFoundException('Assignment request not found or already reviewed.');
    }
    return rejected;
  }

  async remove(user: AuthUser, taskId: string): Promise<void> {
    const task = await this.findVisible(user, taskId);

    if (!isTaskManager(user, assigneeOf(task))) {
      throw new ForbiddenException('You cannot delete this task.');
    }

    await this.database.delete(tasks).where(eq(tasks.id, taskId));
  }

  async update(user: AuthUser, taskId: string, dto: UpdateTaskDto) {
    const task = await this.findVisible(user, taskId);

    if (!isTaskManager(user, assigneeOf(task))) {
      throw new ForbiddenException('You cannot edit this task.');
    }
    if (CLOSED.includes(task.status)) {
      throw new ConflictException('Done or cancelled tasks cannot be edited.');
    }
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      const target = await this.findAssignmentTarget(user, dto.assigneeId);
      if (!target) {
        throw new BadRequestException('Choose an active employee or manager from your company.');
      }
      if (user.role === 'manager' && target.managerId !== user.id) {
        throw new BadRequestException(
          'Changing to an employee outside your team requires a new admin approval request.',
        );
      }
    }
    if (dto.deadline && new Date(dto.deadline).getTime() !== task.deadline.getTime()) {
      this.assertNotInThePast(dto.deadline);
      await this.assertNotHoliday(user, dto.deadline);
    }

    await this.database
      .update(tasks)
      .set({
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        assigneeId: dto.assigneeId,
      })
      .where(eq(tasks.id, taskId));

    return this.get(user, taskId);
  }

  async changeStatus(user: AuthUser, taskId: string, dto: StatusChangeDto) {
    const task = await this.findVisible(user, taskId);
    const denial = denialFor(user, task, assigneeOf(task), dto.action);

    if (denial === 'forbidden') {
      throw new ForbiddenException('You cannot do that on this task.');
    }
    if (commentRequired(dto.action) && !dto.comment) {
      throw new BadRequestException('A comment is required for this action.');
    }
    if (denial === 'invalid_status') {
      throw new ConflictException('This action is not available for the task’s current status.');
    }

    const to = nextStatus(dto.action);

    await this.database.transaction(async (tx) => {
      // Optimistic check: only update if nobody changed the status since we read it.
      const changed = await tx
        .update(tasks)
        .set({
          status: to,
          completedAt: to === 'done' ? new Date() : dto.action === 'reopen' ? null : undefined,
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.status, task.status)))
        .returning({ id: tasks.id });

      if (changed.length === 0) {
        throw new ConflictException(
          'This task was changed by someone else. Refresh and try again.',
        );
      }

      await tx.insert(taskActivity).values({
        taskId,
        actorId: user.id,
        type: 'status_change',
        fromStatus: task.status,
        toStatus: to,
        comment: dto.comment,
      });
    });

    return this.get(user, taskId);
  }

  async comment(user: AuthUser, taskId: string, dto: CommentDto) {
    await this.findVisible(user, taskId);

    const [created] = await this.database
      .insert(taskActivity)
      .values({ taskId, actorId: user.id, type: 'comment', comment: dto.body })
      .returning({ id: taskActivity.id });

    const [activity] = await this.activityQuery(taskId, created.id);
    return activity;
  }

  async activity(user: AuthUser, taskId: string) {
    await this.findVisible(user, taskId);
    return { items: await this.activityQuery(taskId) };
  }

  private activityQuery(taskId: string, activityId?: string) {
    return this.database
      .select({
        id: taskActivity.id,
        taskId: taskActivity.taskId,
        actorId: taskActivity.actorId,
        actorName: users.fullName,
        type: taskActivity.type,
        fromStatus: taskActivity.fromStatus,
        toStatus: taskActivity.toStatus,
        comment: taskActivity.comment,
        createdAt: taskActivity.createdAt,
      })
      .from(taskActivity)
      .innerJoin(users, eq(users.id, taskActivity.actorId))
      .where(
        and(
          eq(taskActivity.taskId, taskId),
          activityId ? eq(taskActivity.id, activityId) : undefined,
        ),
      )
      .orderBy(asc(taskActivity.createdAt), asc(taskActivity.id));
  }

  private baseSelect() {
    return this.database
      .select(TASK_COLUMNS)
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .innerJoin(creator, eq(creator.id, tasks.createdById));
  }

  // Admin: every company task. Manager: their own plus their team's. Employee: their own.
  private visibleTo(user: AuthUser): SQL | undefined {
    if (user.role === 'admin') return undefined;
    if (user.role === 'manager') {
      return or(
        managedPeople(user, assignee),
        eq(tasks.assigneeId, user.id),
        eq(tasks.createdById, user.id),
      );
    }
    return eq(tasks.assigneeId, user.id);
  }

  // A task outside the caller's company or visibility is a 404.
  private async findVisible(user: AuthUser, taskId: string): Promise<TaskRow> {
    const [row] = await this.baseSelect()
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.companyId, user.companyId as string),
          this.visibleTo(user),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Task not found.');
    }
    return row;
  }

  private assertNotInThePast(deadline: string): void {
    if (new Date(deadline).getTime() < Date.now()) {
      throw new BadRequestException('The deadline must not be in the past.');
    }
  }

  private async assertNotHoliday(user: AuthUser, deadline: string): Promise<void> {
    const [company] = await this.database
      .select({ timezone: companies.timezone })
      .from(companies)
      .where(eq(companies.id, user.companyId as string))
      .limit(1);
    const companyDate = getCompanyDate(company?.timezone ?? 'UTC', new Date(deadline));

    if (isHoliday(companyDate)) {
      throw new BadRequestException('The deadline cannot be on Friday or Saturday because they are holidays.');
    }
  }

  private async findAssignmentTarget(user: AuthUser, assigneeId: string) {
    const roles: Role[] = user.role === 'admin' ? ['manager', 'employee'] : ['employee'];
    const [person] = await this.database
      .select({ id: users.id, role: users.role, managerId: users.managerId })
      .from(users)
      .where(
        and(
          eq(users.id, assigneeId),
          eq(users.companyId, user.companyId as string),
          eq(users.isActive, true),
          inArray(users.role, roles),
        ),
      )
      .limit(1);

    return person;
  }

  private assignmentRequestSelect() {
    return this.database
      .select(ASSIGNMENT_REQUEST_COLUMNS)
      .from(taskAssignmentRequests)
      .innerJoin(requestManager, eq(requestManager.id, taskAssignmentRequests.managerId))
      .innerJoin(requestEmployee, eq(requestEmployee.id, taskAssignmentRequests.employeeId))
      .leftJoin(employeeManager, eq(employeeManager.id, requestEmployee.managerId));
  }

  private loadAssignmentRequest(companyId: string, requestId: string) {
    return this.assignmentRequestSelect()
      .where(and(eq(taskAssignmentRequests.companyId, companyId), eq(taskAssignmentRequests.id, requestId)))
      .limit(1)
      .then(([request]) => request);
  }

  private assertAdmin(user: AuthUser): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only an admin can review task assignment requests.');
    }
  }

  private present(row: TaskRow, user: AuthUser) {
    const { assigneeRole: _role, assigneeManagerId: _managerId, ...task } = row;
    const owner = assigneeOf(row);

    return {
      ...task,
      overdue: row.deadline.getTime() < Date.now() && !CLOSED.includes(row.status),
      allowedActions: allowedActions(user, row, owner),
      // Task managers may edit a task until it is done or cancelled.
      canEdit: isTaskManager(user, owner) && !CLOSED.includes(row.status),
      canDelete: isTaskManager(user, owner),
    };
  }
}
