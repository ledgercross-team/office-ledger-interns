/**
 * Showcase data: 6 gameMasters, 1 org (3 CEO, 5 COO, 10 managers, 50 employees), 4 projects
 * with assigned and unassigned tasks. Dev/demo only; run as the database OWNER, safe to rerun.
 *
 *   HRMS_MIGRATE_DATABASE_URL=postgres://postgres@localhost:5432/office_ledger_hrms \
 *   pnpm exec tsx scripts/showcase-seed.ts
 *
 * Logins are written to scripts/showcase-accounts.md by hand; keep the two in step.
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../src/common/utils/passwords';

config({ path: '.env.local' });

const DOMAIN = 'showcase.local';
const ORG = 'LedgerCross Showcase';
const PASSWORD = 'mypass1234';
const RAFI = { email: 'rafi@gmail.com', password: 'mypass123', name: 'Rafi' };
const addr = (local: string) => `${local}@${DOMAIN}`;
const numbered = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const FIRST = [
  'Aisha',
  'Bilal',
  'Chitra',
  'Dawud',
  'Elina',
  'Farhan',
  'Gita',
  'Hasan',
  'Imran',
  'Jahan',
  'Kabir',
  'Laila',
  'Mehedi',
  'Nadia',
  'Osman',
  'Parveen',
  'Qasim',
  'Rina',
  'Sadia',
  'Tanvir',
];
const LAST = [
  'Rahman',
  'Hossain',
  'Chowdhury',
  'Akter',
  'Islam',
  'Karim',
  'Sarker',
  'Mia',
  'Das',
  'Khan',
];
const nameOf = (i: number) =>
  `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;

const PROJECTS = [
  {
    name: 'Website Redesign',
    description: 'New marketing site and design system.',
    tasks: [
      'Audit current pages',
      'Design homepage mockups',
      'Build component library',
      'Migrate blog content',
      'Accessibility review',
      'Launch checklist',
    ],
  },
  {
    name: 'Mobile App Launch',
    description: 'First release of the employee mobile app.',
    tasks: [
      'Define MVP scope',
      'Build login flow',
      'Push notification setup',
      'Beta tester onboarding',
      'App store assets',
      'Crash reporting',
    ],
  },
  {
    name: 'Payroll Automation',
    description: 'Automate monthly payroll runs.',
    tasks: [
      'Map payroll rules',
      'Import attendance data',
      'Tax table update',
      'Payslip template',
      'Parallel run vs manual',
      'Sign-off with finance',
    ],
  },
  {
    name: 'Customer Onboarding Revamp',
    description: 'Shorten time to first value for new customers.',
    tasks: [
      'Interview five customers',
      'Rewrite welcome emails',
      'In-app checklist',
      'Support macros',
      'Measure activation',
      'Retrospective',
    ],
  },
];
const STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'blocked'] as const;
const URGENCY = ['low', 'medium', 'high'] as const;

async function main(): Promise<void> {
  const url = process.env.HRMS_MIGRATE_DATABASE_URL;
  if (!url) throw new Error('HRMS_MIGRATE_DATABASE_URL (the database owner login) is required.');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');

  const client = new Client({ connectionString: url, options: '-c search_path=hrms,public' });
  await client.connect();
  const hash = await hashPassword(PASSWORD);
  const rafiHash = await hashPassword(RAFI.password);

  const upsertUser = async (email: string, fullName: string, passwordHash = hash) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into users (email, password_hash, full_name, email_verified_at)
       values ($1, $2, $3, now())
       on conflict (email) do update set full_name = excluded.full_name returning id`,
      [email, passwordHash, fullName],
    );
    return rows[0].id;
  };

  try {
    // gameMasters: bootstrap-style rows (no creator), so they are active without a confirmer
    const gms: Array<[string, string, string]> = [[RAFI.email, RAFI.name, rafiHash]];
    numbered('gamemaster', 5).forEach((l, i) => gms.push([addr(l), `${nameOf(i + 40)}`, hash]));
    let gmId = '';
    for (const [email, name, h] of gms) {
      const id = await upsertUser(email, name, h);
      gmId ||= id;
      await client.query(
        `insert into game_masters (user_id, status, confirmed_at) values ($1, 'active', now())
         on conflict (user_id) do nothing`,
        [id],
      );
    }

    const people = {
      ceo: numbered('ceo', 3),
      coo: numbered('coo', 5),
      manager: numbered('manager', 10),
      employee: numbered('employee', 50),
    };
    let n = 0;
    const ids: Record<string, string[]> = {};
    for (const [role, locals] of Object.entries(people)) {
      ids[role] = [];
      for (const l of locals) ids[role].push(await upsertUser(addr(l), nameOf(n++)));
    }

    let orgId = (await client.query<{ id: string }>('select id from orgs where name = $1', [ORG]))
      .rows[0]?.id;
    if (!orgId) {
      await client.query('begin');
      await client.query(
        "select set_config('app.user_id', $1, true), set_config('app.org_id', '', true)",
        [gmId],
      );
      const r = await client.query<{ gm_create_org: string }>('select gm_create_org($1, $2, $3)', [
        ORG,
        'standard',
        ids.ceo[0],
      ]);
      orgId = r.rows[0].gm_create_org;
      await client.query('commit');
    }

    await client.query('begin');
    await client.query(
      "select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)",
      [orgId],
    );
    for (const role of ['ceo', 'coo', 'manager', 'employee'] as const) {
      for (const userId of ids[role]) {
        await client.query(
          `insert into org_members (org_id, user_id, role) values ($1, $2, $3::member_role)
           on conflict (org_id, user_id) do nothing`,
          [orgId, userId, role],
        );
      }
    }
    const members = await client.query<{ id: string; user_id: string }>(
      'select id, user_id from org_members where org_id = $1',
      [orgId],
    );
    const memberOf = new Map(members.rows.map((m) => [m.user_id, m.id]));
    const mid = (role: string, i: number) => memberOf.get(ids[role][i])!;
    const creator = mid('ceo', 0);

    const hasProjects =
      (await client.query('select 1 from projects where org_id = $1 limit 1', [orgId])).rows
        .length > 0;
    if (!hasProjects) {
      for (const [pi, p] of PROJECTS.entries()) {
        const project = await client.query<{ id: string }>(
          `insert into projects (org_id, name, description, start_date, due_date, created_by)
           values ($1, $2, $3, current_date - 14, current_date + 60, $4) returning id`,
          [orgId, p.name, p.description, creator],
        );
        const projectId = project.rows[0].id;
        // each project: 3 managers (first is lead) and 12 employees, rotating through the roster
        const team = [
          ...[0, 1, 2].map((k) => ({
            id: mid('manager', (pi * 2 + k) % 10),
            role: 'manager',
            lead: k === 0,
          })),
          ...Array.from({ length: 12 }, (_, k) => ({
            id: mid('employee', (pi * 12 + k) % 50),
            role: 'employee',
            lead: false,
          })),
        ];
        for (const t of team) {
          await client.query(
            `insert into project_members (org_id, project_id, member_id, role, is_lead, lead_tagged_by)
             values ($1, $2, $3, $4::project_role, $5, $6)`,
            [orgId, projectId, t.id, t.role, t.lead, t.lead ? creator : null],
          );
        }
        for (const [ti, title] of p.tasks.entries()) {
          const assigned = ti % 3 !== 2; // every third task is left unassigned
          const status = assigned ? STATUSES[(pi + ti) % STATUSES.length] : 'todo';
          const task = await client.query<{ id: string }>(
            `insert into tasks (org_id, project_id, title, description, urgency, due_at, created_by)
             values ($1, $2, $3, $4, $5::task_urgency, now() + make_interval(days => $6), $7) returning id`,
            [
              orgId,
              projectId,
              title,
              `${title} for ${p.name}.`,
              URGENCY[(pi + ti) % 3],
              3 + ti * 5,
              team[0].id,
            ],
          );
          const taskId = task.rows[0].id;
          if (assigned) {
            // a task needs one manager and one employee before it can leave To do
            const who = team[3 + ((ti * 2) % 12)];
            for (const [memberId, role] of [
              [team[0].id, 'manager'],
              [who.id, 'employee'],
            ]) {
              await client.query(
                `insert into task_assignees (org_id, task_id, member_id, role, assigned_by) values ($1, $2, $3, $4::project_role, $5)`,
                [orgId, taskId, memberId, role, team[0].id],
              );
            }
          }
          // status moves only along legal transitions: todo > in_progress > in_review > done
          const path: Record<string, string[]> = {
            todo: [],
            in_progress: ['in_progress'],
            in_review: ['in_progress', 'in_review'],
            done: ['in_progress', 'in_review', 'done'],
            blocked: ['blocked'],
          };
          for (const step of path[status]) {
            await client.query(
              `update tasks set status = $2::task_status,
                 blocked_reason = case when $2 = 'blocked' then 'Waiting on external input' end
               where id = $1`,
              [taskId, step],
            );
          }
        }
      }
    }
    await client.query('commit');
    console.log(`seeded ${ORG} (${orgId})`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
