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
  eq,
  inArray,
  lt,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser, Role } from '../../auth/auth.types';
import { DRIZZLE, type Database } from '../../db/db.module';
import { taskActivity, tasks, users } from '../../db/schema';
import { manageableRoles } from '../users/visibility';
import type {
  CommentDto,
  CreateTaskDto,
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
  type TaskStatus,
} from './task-rules';

const assignee = aliasedTable(users, 'assignee');
const creator = aliasedTable(users, 'creator');

const CLOSED: TaskStatus[] = ['done', 'cancelled'];

const TASK_COLUMNS = {
  id: tasks.id,
  companyId: tasks.companyId,
  title: tasks.title,
  description: tasks.description,
  priority: tasks.priority,
  status: tasks.status,
  deadline: tasks.deadline,
  assigneeId: tasks.assigneeId,
  assigneeName: assignee.fullName,
  assigneeRole: assignee.role,
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
  priority: 'low' | 'medium' | 'high';
  status: TaskStatus;
  deadline: Date;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  createdById: string;
  creatorName: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TasksService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async list(user: AuthUser, query: ListTasksQueryDto) {
    const where = and(
      eq(tasks.companyId, user.companyId as string),
      this.visibleTo(user),
      query.status ? eq(tasks.status, query.status) : undefined,
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
      .orderBy(asc(tasks.deadline), asc(tasks.id))
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
    await this.assertAssignable(user, dto.assigneeId);

    const [created] = await this.database
      .insert(tasks)
      .values({
        companyId: user.companyId as string,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        deadline: new Date(dto.deadline),
        assigneeId: dto.assigneeId,
        createdById: user.id,
      })
      .returning({ id: tasks.id });

    return this.get(user, created.id);
  }

  async update(user: AuthUser, taskId: string, dto: UpdateTaskDto) {
    const task = await this.findVisible(user, taskId);

    if (!isTaskManager(user, task.assigneeRole as Role)) {
      throw new ForbiddenException('You cannot edit this task.');
    }
    if (CLOSED.includes(task.status)) {
      throw new ConflictException('Done or cancelled tasks cannot be edited.');
    }
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      await this.assertAssignable(user, dto.assigneeId);
    }

    await this.database
      .update(tasks)
      .set({
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        assigneeId: dto.assigneeId,
      })
      .where(eq(tasks.id, taskId));

    return this.get(user, taskId);
  }

  async changeStatus(user: AuthUser, taskId: string, dto: StatusChangeDto) {
    const task = await this.findVisible(user, taskId);
    const denial = denialFor(user, task, task.assigneeRole as Role, dto.action);

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

  // Admin: every company task. Manager: tasks of employees plus their own. Employee: their own.
  private visibleTo(user: AuthUser): SQL | undefined {
    if (user.role === 'admin') return undefined;
    if (user.role === 'manager') {
      return or(eq(assignee.role, 'employee'), eq(tasks.assigneeId, user.id));
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

  // Active, in the caller's company, and a role the caller may assign to.
  private async assertAssignable(user: AuthUser, assigneeId: string): Promise<void> {
    const [person] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, assigneeId),
          eq(users.companyId, user.companyId as string),
          eq(users.isActive, true),
          inArray(users.role, manageableRoles(user.role)),
        ),
      )
      .limit(1);

    if (!person) {
      throw new BadRequestException('Assignee must be an active person you can assign tasks to.');
    }
  }

  private present(row: TaskRow, user: AuthUser) {
    const { assigneeRole, ...task } = row;

    return {
      ...task,
      overdue: row.deadline.getTime() < Date.now() && !CLOSED.includes(row.status),
      allowedActions: allowedActions(user, row, assigneeRole as Role),
      // Task managers may edit a task until it is done or cancelled.
      canEdit: isTaskManager(user, assigneeRole as Role) && !CLOSED.includes(row.status),
    };
  }
}
