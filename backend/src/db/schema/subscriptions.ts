import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { timestamps } from './columns';
import { users } from './users';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    planName: varchar('plan_name', { length: 60 }).notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
      }),
    ...timestamps,
  },
  (t) => [
    check('subscriptions_dates_valid', sql`ends_on >= starts_on`),
    index('subscriptions_company_ends_idx').on(t.companyId, t.endsOn),
  ],
);
