import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { AuthUser } from '../../auth/auth.types';
import { DRIZZLE, type Database } from '../../db/db.module';
import { complaints, leaveRequests } from '../../db/schema';
import type { CreateComplaintDto, CreateLeaveRequestDto } from './dto/employee-services.dto';

@Injectable()
export class EmployeeServicesService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async listLeaveRequests(user: AuthUser) {
    const employeeId = this.employeeId(user);
    const items = await this.database
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.employeeId, employeeId))
      .orderBy(desc(leaveRequests.createdAt));

    return { items };
  }

  async createLeaveRequest(user: AuthUser, dto: CreateLeaveRequestDto) {
    const employeeId = this.employeeId(user);
    if (dto.endOn < dto.startOn) {
      throw new BadRequestException('The leave end date must be on or after the start date.');
    }

    const [created] = await this.database
      .insert(leaveRequests)
      .values({
        companyId: this.companyId(user),
        employeeId,
        leaveType: dto.leaveType,
        startOn: dto.startOn,
        endOn: dto.endOn,
        reason: dto.reason,
      })
      .returning();

    return created;
  }

  async listComplaints(user: AuthUser) {
    const employeeId = this.employeeId(user);
    const items = await this.database
      .select()
      .from(complaints)
      .where(eq(complaints.employeeId, employeeId))
      .orderBy(desc(complaints.createdAt));

    return { items };
  }

  async createComplaint(user: AuthUser, dto: CreateComplaintDto) {
    const employeeId = this.employeeId(user);
    const [created] = await this.database
      .insert(complaints)
      .values({
        companyId: this.companyId(user),
        employeeId,
        category: dto.category,
        subject: dto.subject,
        details: dto.details,
      })
      .returning();

    return created;
  }

  private employeeId(user: AuthUser): string {
    if (user.role !== 'employee' || !user.companyId) {
      throw new ForbiddenException('Only employees can use this service.');
    }
    return user.id;
  }

  private companyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not assigned to a company.');
    }
    return user.companyId;
  }
}
