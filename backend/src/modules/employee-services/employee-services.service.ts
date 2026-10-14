import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { AuthUser } from '../../auth/auth.types';
import { DRIZZLE, type Database } from '../../db/db.module';
import { complaints } from '../../db/schema';
import type { CreateComplaintDto } from './dto/employee-services.dto';

@Injectable()
export class EmployeeServicesService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

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
