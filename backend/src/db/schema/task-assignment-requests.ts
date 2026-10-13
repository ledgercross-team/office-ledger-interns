import { foreignKey, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { timestamps } from './columns';
import { taskAssignmentRequestStatusEnum, taskCategoryEnum, taskPriorityEnum } from './enums';
import { tasks } from './tasks';
import { users } from './users';

export const taskAssignmentRequests = pgTable(
  'task_assignment_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    managerId: uuid('manager_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    category: taskCategoryEnum('category').notNull().default('general'),
    priority: taskPriorityEnum('priority').notNull(),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    status: taskAssignmentRequestStatusEnum('status').notNull().default('pending'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'task_assignment_requests_manager_same_company_fk',
      columns: [t.managerId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'task_assignment_requests_employee_same_company_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    index('task_assignment_requests_company_status_idx').on(t.companyId, t.status),
    index('task_assignment_requests_manager_idx').on(t.managerId),
    index('task_assignment_requests_employee_idx').on(t.employeeId),
  ],
);
