import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { attendanceStatusEnum } from './enums';
import { companies } from './companies';
import { timestamps } from './columns';
import { users } from './users';

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull(),
    workDate: date('work_date').notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    status: attendanceStatusEnum('status').notNull(),
    note: text('note'),
    editedById: uuid('edited_by_id').references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'attendance_user_same_company_fk',
      columns: [t.userId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    unique('attendance_user_date_unique').on(t.userId, t.workDate),
    index('attendance_company_date_idx').on(t.companyId, t.workDate),
    check(
      'attendance_checkout_after_checkin',
      sql`check_out_at IS NULL OR check_out_at > check_in_at`,
    ),
  ],
);
