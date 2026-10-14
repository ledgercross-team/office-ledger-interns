/**
 * Seeds the HRMS database with demo people. Dev only, safe to run twice.
 *
 *   pnpm db:seed:hrms
 *
 * Runs as the database OWNER (HRMS_MIGRATE_DATABASE_URL), because it creates users and the
 * bootstrap gameMaster, which the app role must never do. Passwords come from
 * SEED_DEMO_PASSWORD. Every org is created through gm_create_org, as the platform does.
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../../common/utils/passwords';

config({ path: '.env.local' });

const DOMAIN = 'demo.local';

interface OrgSeed {
  name: string;
  plan: 'standard' | 'premium';
  ceo: string;
  members: Array<{ email: string; name: string; role: 'coo' | 'manager' | 'employee' }>;
}

const ORGS: OrgSeed[] = [
  {
    name: 'Acme Demo',
    plan: 'standard',
    ceo: 'ceo.acme',
    members: [
      { email: 'coo.acme', name: 'Casey Okafor', role: 'coo' },
      { email: 'manager1.acme', name: 'Mira Hossain', role: 'manager' },
      { email: 'manager2.acme', name: 'Noor Rahman', role: 'manager' },
      { email: 'employee1.acme', name: 'Ibrahim Khan', role: 'employee' },
      { email: 'employee2.acme', name: 'Sara Ahmed', role: 'employee' },
      { email: 'employee3.acme', name: 'Tariq Aziz', role: 'employee' },
      // belongs to both demo orgs, to try the org switcher
      { email: 'multi', name: 'Lena Multi', role: 'manager' },
    ],
  },
  {
    name: 'Globex Demo',
    plan: 'standard',
    ceo: 'ceo.globex',
    members: [
      { email: 'manager1.globex', name: 'Omar Faruk', role: 'manager' },
      { email: 'employee1.globex', name: 'Priya Das', role: 'employee' },
      { email: 'multi', name: 'Lena Multi', role: 'employee' },
    ],
  },
];

const FULL_NAMES: Record<string, string> = {
  'ceo.acme': 'Aisha Chowdhury',
  'ceo.globex': 'Gabriel Stone',
};

const addr = (local: string) => `${local}@${DOMAIN}`;

async function main(): Promise<void> {
  const url = process.env.HRMS_MIGRATE_DATABASE_URL;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!url) throw new Error('HRMS_MIGRATE_DATABASE_URL (the database owner login) is required.');
  if (!password) throw new Error('SEED_DEMO_PASSWORD is required to seed the database.');

  const client = new Client({ connectionString: url, options: '-c search_path=hrms,public' });
  await client.connect();
  const passwordHash = await hashPassword(password);

  const upsertUser = async (local: string, fullName: string): Promise<string> => {
    const { rows } = await client.query<{ id: string }>(
      `insert into users (email, password_hash, full_name, email_verified_at)
       values ($1, $2, $3, now())
       on conflict (email) do update set full_name = excluded.full_name
       returning id`,
      [addr(local), passwordHash, fullName],
    );
    return rows[0].id;
  };

  try {
    // bootstrap gameMaster: created_by is null, so it is active without a second gameMaster
    const gmId = await upsertUser('gm', 'Gwen Platform');
    await client.query(
      `insert into game_masters (user_id, status) values ($1, 'active') on conflict (user_id) do nothing`,
      [gmId],
    );

    for (const org of ORGS) {
      const ceoId = await upsertUser(org.ceo, FULL_NAMES[org.ceo] ?? org.ceo);
      const existing = await client.query<{ id: string }>('select id from orgs where name = $1', [org.name]);

      let orgId = existing.rows[0]?.id;
      if (!orgId) {
        // gm_create_org must run in its own transaction, as the gameMaster
        await client.query('begin');
        await client.query("select set_config('app.user_id', $1, true), set_config('app.org_id', '', true)", [gmId]);
        const created = await client.query<{ gm_create_org: string }>(
          'select gm_create_org($1, $2, $3)',
          [org.name, org.plan, ceoId],
        );
        orgId = created.rows[0].gm_create_org;
        await client.query('commit');
      }

      // the rest of the people, in system context (no member id) inside this org
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)", [orgId]);
      for (const member of org.members) {
        const userId = await upsertUser(member.email, member.name);
        await client.query(
          `insert into org_members (org_id, user_id, role) values ($1, $2, $3::member_role)
           on conflict (org_id, user_id) do nothing`,
          [orgId, userId, member.role],
        );
      }
      await client.query('commit');
      console.log(`seeded ${org.name}`);
    }

    console.log(`done. Sign in at /login as <name>@${DOMAIN} with SEED_DEMO_PASSWORD.`);
    console.log('  gm, ceo.acme, coo.acme, manager1.acme, employee1.acme, ceo.globex, multi (two orgs)');
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
