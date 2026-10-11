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
import { manageableRoles } from '../users/visibility';
import {
  attendanceStatus,
  buildDays,
  defaultRange,
  rangeError,
  workDateFor,
} from './attendance.rules';
import type {
  CorrectAttendanceDto,
  MyAttendanceQueryDto,
  TeamAttendanceQueryDto,
} from './dto/attendance.dto';

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
          inArray(users.role, manageableRoles(user.role)),
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

  // Admin: managers and employees. Manager: employees and themselves. Else 404.
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

  // Admin sees managers and employees; a manager sees employees and themselves.
  private visibleTo(caller: AuthUser) {
    const roles = inArray(users.role, manageableRoles(caller.role));
    return caller.role === 'manager' ? or(roles, eq(users.id, caller.id)) : roles;
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
