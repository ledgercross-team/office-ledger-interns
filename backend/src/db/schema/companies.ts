import { boolean, pgTable, time, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  workStartTime: time('work_start_time').notNull().default('09:00'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});
