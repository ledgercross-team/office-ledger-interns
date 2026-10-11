import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { timestamps } from './columns';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    role: userRoleEnum('role').notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    jobTitle: varchar('job_title', { length: 120 }),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    tokenVersion: integer('token_version').notNull().default(0),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references((): AnyPgColumn => users.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
  },
  (t) => [
    unique('users_email_unique').on(t.email),
    unique('users_id_company_unique').on(t.id, t.companyId),
    uniqueIndex('users_one_admin_per_company')
      .on(t.companyId)
      .where(sql`role = 'admin'`),
    index('users_company_role_idx').on(t.companyId, t.role),
    check('users_email_lowercase', sql`email = lower(email)`),
    check('users_company_matches_role', sql`(role = 'game_master') = (company_id IS NULL)`),
  ],
);
