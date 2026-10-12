import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aliasedTable, and, asc, count, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../auth/auth.types';
import { getCompanyDate } from '../../common/utils/company-time';
import { addDays, daysBetween, isWeekday } from '../../common/utils/dates';
import { DRIZZLE, type Database } from '../../db/db.module';
import { attendanceRecords, companies, subscriptions, tasks, users } from '../../db/schema';
import { pickSubscription } from '../game-master/subscription-utils';
import { managedPeople } from '../users/visibility';
import { MessagesService } from '../messages/messages.service';

const assignee = aliasedTable(users, 'assignee');

const OPEN = ['todo', 'in_progress', 'delayed'] as const;
const CLOSED = ['done', 'cancelled'] as const;
const OVERDUE_LIST_SIZE = 10;

interface Company {
  id: string;
  timezone: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly messages: MessagesService,
  ) {}

  async summary(user: AuthUser) {
    const [company] = await this.database
      .select({ id: companies.id, timezone: companies.timezone })
      .from(companies)
      .where(eq(companies.id, user.companyId as string))
      .limit(1);

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    const summary =
      user.role === 'admin'
        ? await this.admin(user, company)
        : user.role === 'manager'
          ? await this.manager(user, company)
          : await this.employee(user, company);

    // Times are shown in the company's timezone.
    return { ...summary, timezone: company.timezone };
  }

  private async employee(user: AuthUser, company: Company) {
    return {
      role: user.role,
      ...(await this.taskCounts(company, eq(tasks.assigneeId, user.id))),
      today: await this.myToday(user, company),
    };
  }

  // Own counts at the top level; the employees they manage under `team`.
  private async manager(user: AuthUser, company: Company) {
    // Only the employees who report to this manager.
    const teamTasks = and(eq(tasks.companyId, company.id), managedPeople(user, assignee));
    const people = and(
      eq(users.companyId, company.id),
      managedPeople(user),
      eq(users.isActive, true),
    );
    const attendance = await this.attendanceToday(company, people);

    return {
      role: user.role,
      ...(await this.taskCounts(company, eq(tasks.assigneeId, user.id))),
      today: await this.myToday(user, company),
      team: {
        people: attendance.total,
        ...(await this.taskCounts(company, teamTasks)),
        tasksByStatus: await this.tasksByStatus(teamTasks),
        overdueList: await this.overdueList(teamTasks),
        attendance,
      },
    };
  }

  private async admin(user: AuthUser, company: Company) {
    const companyTasks = eq(tasks.companyId, company.id);
    const staff = and(
      eq(users.companyId, company.id),
      eq(users.isActive, true),
      inArray(users.role, ['manager', 'employee']),
    );

    const roleRows = await this.database
      .select({ role: users.role, total: count() })
      .from(users)
      .where(and(eq(users.companyId, company.id), eq(users.isActive, true)))
      .groupBy(users.role);
    const peopleByRole = { game_master: 0, admin: 0, manager: 0, employee: 0 };
    for (const row of roleRows) {
      peopleByRole[row.role] = row.total;
    }

    const attendance = await this.attendanceToday(company, staff);
    const today = getCompanyDate(company.timezone);
    const subs = await this.database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, company.id));
    const subscription = pickSubscription(subs, today);

    return {
      role: user.role,
      ...(await this.taskCounts(company, companyTasks)),
      activePeople: Object.values(peopleByRole).reduce((sum, n) => sum + n, 0),
      peopleByRole,
      tasksByStatus: await this.tasksByStatus(companyTasks),
      overdueList: await this.overdueList(companyTasks),
      attendance,
      // Percent of active managers and employees who have checked in today.
      todayAttendanceRate:
        attendance.total === 0
          ? 0
          : Math.round(((attendance.present + attendance.late) / attendance.total) * 100),
      subscriptionEndsOn: subscription?.endsOn ?? null,
      daysLeft: subscription ? daysBetween(today, subscription.endsOn) : null,
      unreadMessages: await this.messages.unreadForAdmin(company.id),
    };
  }

  // open = todo, in_progress, delayed. overdue = past deadline and not done or cancelled.
  // doneThisWeek = completed since Monday, in the company's timezone.
  private async taskCounts(company: Company, where: SQL | undefined) {
    const today = getCompanyDate(company.timezone);
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const monday = addDays(today, -((weekday + 6) % 7));

    const [row] = await this.database
      .select({
        openTasks: sql<number>`(count(*) filter (where ${inArray(tasks.status, [...OPEN])}))::int`,
        overdueTasks: sql<number>`(count(*) filter (where ${tasks.deadline} < now() and ${notInArray(tasks.status, [...CLOSED])}))::int`,
        doneThisWeek: sql<number>`(count(*) filter (where ${tasks.status} = 'done' and (${tasks.completedAt} at time zone ${company.timezone})::date >= ${monday}::date))::int`,
      })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(and(eq(tasks.companyId, company.id), where));

    return row;
  }

  private async tasksByStatus(where: SQL | undefined) {
    const rows = await this.database
      .select({ status: tasks.status, total: count() })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(where)
      .groupBy(tasks.status);

    const byStatus = { todo: 0, in_progress: 0, delayed: 0, done: 0, incomplete: 0, cancelled: 0 };
    for (const row of rows) {
      byStatus[row.status] = row.total;
    }
    return byStatus;
  }

  private overdueList(where: SQL | undefined) {
    return this.database
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        deadline: tasks.deadline,
        assigneeId: tasks.assigneeId,
        assigneeName: assignee.fullName,
      })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(and(where, sql`${tasks.deadline} < now()`, notInArray(tasks.status, [...CLOSED])))
      .orderBy(asc(tasks.deadline))
      .limit(OVERDUE_LIST_SIZE);
  }

  private async myToday(user: AuthUser, company: Company) {
    const workDate = getCompanyDate(company.timezone);
    const [record] = await this.database
      .select({
        status: attendanceRecords.status,
        checkInAt: attendanceRecords.checkInAt,
        checkOutAt: attendanceRecords.checkOutAt,
      })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, user.id), eq(attendanceRecords.workDate, workDate)))
      .limit(1);

    return {
      workDate,
      // Absent only counts on weekdays; a weekend with no record has no status.
      status: record?.status ?? (isWeekday(workDate) ? ('absent' as const) : null),
      checkInAt: record?.checkInAt ?? null,
      checkOutAt: record?.checkOutAt ?? null,
    };
  }

  // Today's check-ins among the active people matching `people`.
  private async attendanceToday(company: Company, people: SQL | undefined) {
    const workDate = getCompanyDate(company.timezone);

    const [{ total }] = await this.database.select({ total: count() }).from(users).where(people);
    const rows = await this.database
      .select({ status: attendanceRecords.status, total: count() })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(and(people, eq(attendanceRecords.workDate, workDate)))
      .groupBy(attendanceRecords.status);

    const present = rows.find((row) => row.status === 'present')?.total ?? 0;
    const late = rows.find((row) => row.status === 'late')?.total ?? 0;

    const absent = isWeekday(workDate) ? Math.max(total - present - late, 0) : 0;

    return { total, present, late, absent };
  }
}
