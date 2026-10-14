import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, pgTable, text, timestamp, varchar, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { timestamps } from './columns';
import { leaveRequestStatusEnum } from './enums';
import { users } from './users';

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').notNull(),
    leaveType: varchar('leave_type', { length: 40 }).notNull(),
    startOn: date('start_on').notNull(),
    endOn: date('end_on').notNull(),
    reason: text('reason').notNull(),
    status: leaveRequestStatusEnum('status').notNull().default('pending'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'leave_requests_employee_same_company_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    index('leave_requests_employee_created_idx').on(t.employeeId, t.createdAt),
    check('leave_requests_dates_ordered', sql`${t.endOn} >= ${t.startOn}`),
    check('leave_requests_reason_length', sql`char_length(${t.reason}) BETWEEN 1 AND 2000`),
  ],
);
