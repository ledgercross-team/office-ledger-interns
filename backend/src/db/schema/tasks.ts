import { foreignKey, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { timestamps } from './columns';
import { taskCategoryEnum, taskPriorityEnum, taskStatusEnum } from './enums';
import { users } from './users';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    category: taskCategoryEnum('category').notNull().default('general'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    status: taskStatusEnum('status').notNull().default('todo'),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    assigneeId: uuid('assignee_id').notNull(),
    createdById: uuid('created_by_id').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'tasks_assignee_same_company_fk',
      columns: [t.assigneeId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'tasks_creator_same_company_fk',
      columns: [t.createdById, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    index('tasks_company_status_idx').on(t.companyId, t.status),
    index('tasks_assignee_deadline_idx').on(t.assigneeId, t.deadline),
    index('tasks_company_category_idx').on(t.companyId, t.category),
  ],
);
