import argon2 from 'argon2';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

config({ path: '.env.local' });

const { attendanceRecords, companies, messages, subscriptions, taskActivity, tasks, users } =
  schema;

const tableNames = [
  'task_activity',
  'tasks',
  'attendance_records',
  'messages',
  'refresh_tokens',
  'subscriptions',
  'users',
  'companies',
] as const;

function dateFromToday(daysOffset: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function recentWeekdays(count: number): string[] {
  const dates: string[] = [];
  let offset = 0;

  while (dates.length < count) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);

    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      dates.push(date.toISOString().slice(0, 10));
    }

    offset += 1;
  }

  return dates;
}

async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const seedPassword = process.env.SEED_DEMO_PASSWORD;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database.');
  }

  if (!seedPassword) {
    throw new Error('SEED_DEMO_PASSWORD is required to seed the database.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const passwordHash = await argon2.hash(seedPassword);
    const [acme, globex] = await db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(`TRUNCATE TABLE ${tableNames.map((table) => `"${table}"`).join(', ')} CASCADE`),
      );

      const [insertedAcme, insertedGlobex] = await tx
        .insert(companies)
        .values([{ name: 'Acme Corp' }, { name: 'Globex Ltd' }])
        .returning();

      const [gameMaster] = await tx
        .insert(users)
        .values({
          role: 'game_master',
          email: 'gm@office-ledger.local',
          passwordHash,
          fullName: 'Office Ledger Game Master',
          mustChangePassword: false,
        })
        .returning();

      const seededUsers = await tx
        .insert(users)
        .values([
          {
            companyId: insertedAcme.id,
            role: 'admin',
            email: 'admin@acme.local',
            passwordHash,
            fullName: 'Acme Admin',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
          {
            companyId: insertedAcme.id,
            role: 'manager',
            email: 'manager1@acme.local',
            passwordHash,
            fullName: 'Acme Manager One',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
          {
            companyId: insertedAcme.id,
            role: 'manager',
            email: 'manager2@acme.local',
            passwordHash,
            fullName: 'Acme Manager Two',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
          ...Array.from({ length: 4 }, (_, index) => ({
            companyId: insertedAcme.id,
            role: 'employee' as const,
            email: `employee${index + 1}@acme.local`,
            passwordHash,
            fullName: `Acme Employee ${index + 1}`,
            mustChangePassword: false,
            createdById: gameMaster.id,
          })),
          {
            companyId: insertedGlobex.id,
            role: 'admin',
            email: 'admin@globex.local',
            passwordHash,
            fullName: 'Globex Admin',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
          {
            companyId: insertedGlobex.id,
            role: 'manager',
            email: 'manager1@globex.local',
            passwordHash,
            fullName: 'Globex Manager One',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
          {
            companyId: insertedGlobex.id,
            role: 'employee',
            email: 'employee1@globex.local',
            passwordHash,
            fullName: 'Globex Employee One',
            mustChangePassword: false,
            createdById: gameMaster.id,
          },
        ])
        .returning();

      const userByEmail = new Map(seededUsers.map((user) => [user.email, user]));
      const acmeAdmin = userByEmail.get('admin@acme.local');
      const acmeManager1 = userByEmail.get('manager1@acme.local');
      const acmeManager2 = userByEmail.get('manager2@acme.local');
      const globexAdmin = userByEmail.get('admin@globex.local');

      if (!acmeAdmin || !acmeManager1 || !acmeManager2 || !globexAdmin) {
        throw new Error('Seed users were not created as expected.');
      }

      const acmeEmployees = Array.from({ length: 4 }, (_, index) =>
        userByEmail.get(`employee${index + 1}@acme.local`),
      ).filter((user): user is NonNullable<typeof user> => user !== undefined);

      if (acmeEmployees.length !== 4) {
        throw new Error('Acme employee seed users were not created as expected.');
      }

      await tx.insert(subscriptions).values([
        {
          companyId: insertedAcme.id,
          planName: 'Standard',
          startsOn: dateFromToday(-30),
          endsOn: dateFromToday(335),
          createdById: gameMaster.id,
        },
        {
          companyId: insertedGlobex.id,
          planName: 'Standard',
          startsOn: dateFromToday(-375),
          endsOn: dateFromToday(-10),
          createdById: gameMaster.id,
        },
      ]);

      const seededTasks = await tx
        .insert(tasks)
        .values([
          {
            companyId: insertedAcme.id,
            title: 'Prepare monthly operations report',
            status: 'todo',
            assigneeId: acmeEmployees[0]!.id,
            createdById: acmeAdmin.id,
            deadline: new Date(Date.now() - 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Review onboarding checklist',
            status: 'todo',
            assigneeId: acmeEmployees[1]!.id,
            createdById: acmeAdmin.id,
            deadline: new Date(Date.now() + 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Update client contact records',
            status: 'in_progress',
            assigneeId: acmeEmployees[2]!.id,
            createdById: acmeManager1.id,
            deadline: new Date(Date.now() + 2 * 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Audit attendance exceptions',
            status: 'in_progress',
            assigneeId: acmeManager1.id,
            createdById: acmeAdmin.id,
            deadline: new Date(Date.now() + 3 * 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Publish the office calendar',
            status: 'delayed',
            assigneeId: acmeManager2.id,
            createdById: acmeAdmin.id,
            deadline: new Date(Date.now() - 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Complete payroll handoff',
            status: 'done',
            assigneeId: acmeEmployees[3]!.id,
            createdById: acmeManager1.id,
            deadline: new Date(Date.now() - 2 * 86_400_000),
            completedAt: new Date(Date.now() - 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Archive last quarter documents',
            status: 'done',
            assigneeId: acmeEmployees[0]!.id,
            createdById: acmeAdmin.id,
            deadline: new Date(Date.now() - 3 * 86_400_000),
            completedAt: new Date(Date.now() - 2 * 86_400_000),
          },
          {
            companyId: insertedAcme.id,
            title: 'Resolve an incomplete handover',
            status: 'incomplete',
            assigneeId: acmeEmployees[1]!.id,
            createdById: acmeManager2.id,
            deadline: new Date(Date.now() - 4 * 86_400_000),
          },
        ])
        .returning();

      const activityValues: (typeof taskActivity.$inferInsert)[] = [];
      for (const task of seededTasks.filter((item) => item.status !== 'todo')) {
        activityValues.push({
          taskId: task.id,
          actorId: task.createdById,
          type: 'status_change',
          fromStatus: 'todo',
          toStatus: task.status,
        });
      }

      activityValues.push(
        {
          taskId: seededTasks[2]!.id,
          actorId: acmeManager1.id,
          type: 'comment',
          comment: 'Waiting for the updated client list before final review.',
        },
        {
          taskId: seededTasks[5]!.id,
          actorId: acmeEmployees[3]!.id,
          type: 'comment',
          comment: 'Handoff completed and confirmed by the operations team.',
        },
      );
      await tx.insert(taskActivity).values(activityValues);

      const attendanceDates = recentWeekdays(5);
      const attendanceUsers = [acmeManager1, acmeManager2, ...acmeEmployees] as const;
      const attendanceValues: (typeof attendanceRecords.$inferInsert)[] = [];

      for (const user of attendanceUsers) {
        for (const [dateIndex, workDate] of attendanceDates.entries()) {
          if (user.email === 'employee4@acme.local' && dateIndex === 4) continue;

          const isLate = user.email === 'employee2@acme.local' && dateIndex < 2;
          const checkInAt = new Date(`${workDate}T${isLate ? '09:30' : '09:00'}:00.000Z`);
          const checkOutAt = new Date(`${workDate}T17:00:00.000Z`);

          attendanceValues.push({
            companyId: insertedAcme.id,
            userId: user.id,
            workDate,
            checkInAt,
            checkOutAt,
            status: isLate ? 'late' : 'present',
          });
        }
      }
      await tx.insert(attendanceRecords).values(attendanceValues);

      await tx.insert(messages).values([
        {
          companyId: insertedAcme.id,
          senderId: gameMaster.id,
          body: 'Welcome to Office Ledger. Your workspace is ready.',
          readAt: new Date(),
        },
        {
          companyId: insertedAcme.id,
          senderId: acmeAdmin.id,
          body: 'Thanks. We are ready to onboard the team.',
          readAt: new Date(),
        },
        {
          companyId: insertedGlobex.id,
          senderId: globexAdmin.id,
          body: 'Please contact us about renewing our subscription.',
        },
      ]);

      return [insertedAcme, insertedGlobex] as const;
    });

    console.log(`Seeded ${acme.name} and ${globex.name}.`);
    console.log(
      'Demo accounts: gm@office-ledger.local, admin@acme.local, manager1@acme.local, employee1@acme.local',
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
