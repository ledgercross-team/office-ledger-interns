import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { taskActivityTypeEnum, taskStatusEnum } from './enums';
import { tasks } from './tasks';
import { users } from './users';

export const taskActivity = pgTable(
  'task_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: taskActivityTypeEnum('type').notNull(),
    fromStatus: taskStatusEnum('from_status'),
    toStatus: taskStatusEnum('to_status'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('task_activity_task_created_idx').on(t.taskId, t.createdAt),
    check(
      'task_activity_shape',
      sql`(type = 'comment' AND comment IS NOT NULL AND to_status IS NULL)
       OR (type = 'status_change' AND to_status IS NOT NULL)`,
    ),
  ],
);
