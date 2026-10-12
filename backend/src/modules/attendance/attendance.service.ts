import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../../auth/auth.types';
import { getCompanyDate } from '../../common/utils/company-time';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { DRIZZLE, type Database } from '../../db/db.module';
import { attendanceRecords, companies, users } from '../../db/schema';
import { addDays, daysBetween } from '../../common/utils/dates';
import { managedPeople } from '../users/visibility';
import {
  attendanceStatus,
  buildDays,
  computeStats,
  defaultRange,
  rangeError,
  workDateFor,
  workStartMinutes as workStartMinutesOf,
} from './attendance.rules';
import type {
  CorrectAttendanceDto,
  CreateAttendanceCorrectionDto,
  MyAttendanceQueryDto,
  TeamAttendanceQueryDto,
} from './dto/attendance.dto';

const DEFAULT_STATS_DAYS = 30;
const MIN_STATS_MONTH = '2022-01';

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async checkIn(user: AuthUser) {
    const company = await this.getCompany(user);
    const now = new Date();
    const workDate = workDateFor(company.timezone, now);

    const [existing] = await this.database
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, user.id), eq(attendanceRecords.workDate, workDate)))
      .limit(1);

    if (existing) {
      throw new ConflictException('You have already checked in today.');
    }

    try {
      const [record] = await this.database
        .insert(attendanceRecords)
        .values({
          companyId: company.id,
          userId: user.id,
          workDate,
          checkInAt: now,
          status: attendanceStatus(company.timezone, company.workStartTime, now),
        })
        .returning();
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already checked in today.');
      }
      throw error;
    }
  }

  async checkOut(user: AuthUser) {
    const company = await this.getCompany(user);
    const now = new Date();

    const [record] = await this.database
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, user.id),
          eq(attendanceRecords.workDate, workDateFor(company.timezone, now)),
        ),
      )
      .limit(1);

    if (!record) {
      throw new ConflictException('You have not checked in today.');
    }
    if (record.checkOutAt) {
      throw new ConflictException('You have already checked out today.');
    }

    const [updated] = await this.database
      .update(attendanceRecords)
      .set({ checkOutAt: now })
      .where(eq(attendanceRecords.id, record.id))
      .returning();
    return updated;
  }

  async mine(user: AuthUser, query: MyAttendanceQueryDto) {
    const company = await this.getCompany(user);
    return { timezone: company.timezone, items: await this.daysFor(company, user.id, query) };
  }

  async team(user: AuthUser, query: TeamAttendanceQueryDto) {
    const company = await this.getCompany(user);

    if (query.date) {
      return { timezone: company.timezone, items: await this.dayView(user, company, query.date) };
    }

    if (!query.userId) {
      throw new BadRequestException('Provide date, or userId with from and to.');
    }

    const target = await this.findVisibleUser(user, query.userId);
    return { timezone: company.timezone, items: await this.daysFor(company, target.id, query) };
  }

  async correct(user: AuthUser, recordId: string, dto: CorrectAttendanceDto) {
    const company = await this.getCompany(user);

    const [row] = await this.database
      .select({ record: attendanceRecords })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(
        and(
          eq(attendanceRecords.id, recordId),
          eq(attendanceRecords.companyId, company.id),
          managedPeople(user),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Attendance record not found.');
    }

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : row.record.checkInAt;
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : row.record.checkOutAt;

    if (checkOutAt && checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt.');
    }

    const [updated] = await this.database
      .update(attendanceRecords)
      .set({
        checkInAt,
        checkOutAt,
        status: attendanceStatus(company.timezone, company.workStartTime, checkInAt),
        note: dto.note,
        editedById: user.id,
      })
      .where(eq(attendanceRecords.id, recordId))
      .returning();
    return updated;
  }

  async createCorrection(user: AuthUser, dto: CreateAttendanceCorrectionDto) {
    const company = await this.getCompany(user);
    const [target] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, dto.userId),
          eq(users.companyId, company.id),
          managedPeople(user),
        ),
      )
      .limit(1);

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const [existing] = await this.database
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.companyId, company.id),
          eq(attendanceRecords.userId, dto.userId),
          eq(attendanceRecords.workDate, dto.workDate),
        ),
      )
      .limit(1);

    if (existing) {
      return this.correct(user, existing.id, dto);
    }

    const checkInAt = new Date(dto.checkInAt);
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    if (checkOutAt && checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt.');
    }

    try {
      const [created] = await this.database
        .insert(attendanceRecords)
        .values({
          companyId: company.id,
          userId: dto.userId,
          workDate: dto.workDate,
          checkInAt,
          checkOutAt,
          status: attendanceStatus(company.timezone, company.workStartTime, checkInAt),
          note: dto.note,
          editedById: user.id,
        })
        .returning();
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Attendance for this person and date already exists.');
      }
      throw error;
    }
  }

  // The caller's own tendencies, with the per-day series for charts.
  async statsMe(user: AuthUser, days = DEFAULT_STATS_DAYS) {
    const company = await this.getCompany(user);
    const [me] = await this.database
      .select({ id: users.id, fullName: users.fullName, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return this.statsFor(company, me, days);
  }

  // One visible person's tendencies.
  async statsForUser(caller: AuthUser, userId: string, days = DEFAULT_STATS_DAYS) {
    const company = await this.getCompany(caller);
    const [person] = await this.database
      .select({
        id: users.id,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.companyId, company.id),
          or(this.visibleTo(caller), eq(users.id, caller.id)),
        ),
      )
      .limit(1);

    if (!person) {
      throw new NotFoundException('User not found.');
    }
    return this.statsFor(company, person, days);
  }

  // Everyone the caller can see, best score first. No per-day series, to keep it light.
  async statsTeam(caller: AuthUser, days = DEFAULT_STATS_DAYS, month?: string) {
    const company = await this.getCompany(caller);
    const people = await this.database
      .select({
        id: users.id,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.companyId, company.id), eq(users.isActive, true), this.visibleTo(caller)))
      .orderBy(users.fullName);

    const today = getCompanyDate(company.timezone);
    if (month && month < MIN_STATS_MONTH) {
      throw new BadRequestException(`month cannot be before ${MIN_STATS_MONTH}.`);
    }
    if (month && month > today.slice(0, 7)) {
      throw new BadRequestException('month cannot be in the future.');
    }

    const from = month ? `${month}-01` : addDays(today, -(days - 1));
    const requestedTo = month ? lastDayOfMonth(month) : today;
    const to = requestedTo < today ? requestedTo : today;
    const records = people.length
      ? await this.database
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.companyId, company.id),
              inArray(
                attendanceRecords.userId,
                people.map((person) => person.id),
              ),
              gte(attendanceRecords.workDate, from),
              lte(attendanceRecords.workDate, to),
            ),
          )
      : [];

    const rows = people.map((person) => {
      const mine = records.filter((record) => record.userId === person.id);
      const stats = computeStats({
        records: mine,
        from: month
          ? this.monthWindowStart(from, person.createdAt, company.timezone)
          : this.windowStart(from, person.createdAt, company.timezone, mine),
        to,
        today,
        timezone: company.timezone,
        workStartTime: company.workStartTime,
      });
      const { series: _series, ...summary } = stats;
      return { userId: person.id, fullName: person.fullName, role: person.role, ...summary };
    });

    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.fullName.localeCompare(b.fullName));

    const scored = rows.filter((row) => row.score !== null);
    const offsets = rows.filter((row) => row.avgArrivalOffset !== null);
    const average = (values: number[]) =>
      values.length === 0
        ? null
        : Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);

    const attendance = rows.reduce(
      (totals, row) => ({
        total: totals.total + row.expectedDays,
        onTime: totals.onTime + row.daysOnTime,
        late: totals.late + row.daysLate,
        absent: totals.absent + row.daysAbsent,
      }),
      { total: 0, onTime: 0, late: 0, absent: 0 },
    );
    const percentage = (value: number) =>
      attendance.total === 0 ? null : Math.round((value / attendance.total) * 100);

    return {
      timezone: company.timezone,
      days: month ? Math.max(0, daysBetween(from, to) + 1) : days,
      month: month ?? null,
      from,
      to,
      workStartMinutes: workStartMinutesOf(company.workStartTime),
      summary: {
        people: rows.length,
        avgScore: average(scored.map((row) => row.score as number)),
        avgArrivalOffset: average(offsets.map((row) => row.avgArrivalOffset as number)),
        onTimeRate: average(
          rows.filter((row) => row.punctualityRate !== null).map((r) => r.punctualityRate as number),
        ),
        attendance: {
          ...attendance,
          onTimePercentage: percentage(attendance.onTime),
          latePercentage: percentage(attendance.late),
          absentPercentage: percentage(attendance.absent),
        },
      },
      people: rows,
    };
  }

  private async statsFor(
    company: { id: string; timezone: string; workStartTime: string },
    person: { id: string; fullName: string; role: string; createdAt: Date },
    days: number,
  ) {
    const today = getCompanyDate(company.timezone);
    const from = addDays(today, -(days - 1));

    const records = await this.database
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, person.id),
          eq(attendanceRecords.companyId, company.id),
          gte(attendanceRecords.workDate, from),
          lte(attendanceRecords.workDate, today),
        ),
      );

    const stats = computeStats({
      records,
      from: this.windowStart(from, person.createdAt, company.timezone, records),
      to: today,
      today,
      timezone: company.timezone,
      workStartTime: company.workStartTime,
    });

    return {
      timezone: company.timezone,
      days,
      user: { id: person.id, fullName: person.fullName, role: person.role },
      ...stats,
    };
  }

  // Nobody is "absent" on days before they joined (or before their first record, which
  // covers people whose history was imported).
  private windowStart(
    from: string,
    joinedAt: Date,
    timezone: string,
    records: { workDate: string }[],
  ): string {
    const first = records.reduce(
      (min, record) => (record.workDate < min ? record.workDate : min),
      getCompanyDate(timezone, joinedAt),
    );
    return first > from ? first : from;
  }

  // Monthly dashboard reports cover the selected month even when earlier days have no record.
  // Do not count days before the person joined the company as absences.
  private monthWindowStart(from: string, joinedAt: Date, timezone: string): string {
    const joinedDate = getCompanyDate(timezone, joinedAt);
    return joinedDate > from ? joinedDate : from;
  }

  // Everyone the caller can see on a date, including absent people.
  private async dayView(user: AuthUser, company: { id: string; timezone: string }, date: string) {
    const people = await this.database
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(and(eq(users.companyId, company.id), eq(users.isActive, true), this.visibleTo(user)))
      .orderBy(users.fullName);

    const records = await this.database
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.companyId, company.id),
          eq(attendanceRecords.workDate, date),
          inArray(
            attendanceRecords.userId,
            people.map((person) => person.id),
          ),
        ),
      );

    const today = getCompanyDate(company.timezone);

    return people.map((person) => {
      const [day] = buildDays(
        records.filter((record) => record.userId === person.id),
        date,
        date,
        today,
      );
      return {
        userId: person.id,
        userFullName: person.fullName,
        role: person.role,
        workDate: date,
        status: day?.status ?? 'absent',
        checkInAt: day?.checkInAt ?? null,
        checkOutAt: day?.checkOutAt ?? null,
        record: day?.record ?? null,
      };
    });
  }

  private async daysFor(
    company: { id: string; timezone: string },
    userId: string,
    query: MyAttendanceQueryDto,
  ) {
    const today = getCompanyDate(company.timezone);
    const fallback = defaultRange(today);
    const from = query.from ?? fallback.from;
    const to = query.to ?? fallback.to;

    const problem = rangeError(from, to);
    if (problem) {
      throw new BadRequestException(problem);
    }

    const records = await this.database
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.companyId, company.id),
          gte(attendanceRecords.workDate, from),
          lte(attendanceRecords.workDate, to),
        ),
      )
      .orderBy(desc(attendanceRecords.workDate));

    return buildDays(records, from, to, today);
  }

  // Admin: managers and employees. Manager: their team and themselves. Else 404.
  private async findVisibleUser(caller: AuthUser, userId: string) {
    const [target] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.companyId, caller.companyId as string),
          this.visibleTo(caller),
        ),
      )
      .limit(1);

    if (!target) {
      throw new NotFoundException('User not found.');
    }
    return target;
  }

  // Admin sees managers and employees; a manager sees their own team and themselves.
  private visibleTo(caller: AuthUser) {
    const managed = managedPeople(caller);
    return caller.role === 'manager' ? or(managed, eq(users.id, caller.id)) : managed;
  }

  private async getCompany(user: AuthUser) {
    const [company] = await this.database
      .select({
        id: companies.id,
        timezone: companies.timezone,
        workStartTime: companies.workStartTime,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId as string))
      .limit(1);

    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }
}
