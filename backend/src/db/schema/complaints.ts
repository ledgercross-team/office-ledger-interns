import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, varchar, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { complaintStatusEnum } from './enums';
import { timestamps } from './columns';
import { users } from './users';

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').notNull(),
    category: varchar('category', { length: 40 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    details: text('details').notNull(),
    status: complaintStatusEnum('status').notNull().default('open'),
    response: text('response'),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'complaints_employee_same_company_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete('restrict'),
    index('complaints_employee_created_idx').on(t.employeeId, t.createdAt),
    check('complaints_subject_length', sql`char_length(${t.subject}) BETWEEN 1 AND 200`),
    check('complaints_details_length', sql`char_length(${t.details}) BETWEEN 1 AND 5000`),
  ],
);
