import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { HrmsContextService } from './hrms-context';

// Needs a THROWAWAY database loaded with docs/*.sql (see backend/scripts/hrms-rule-tests.sh):
//   HRMS_TEST_APP_URL    login as hrms_api
//   HRMS_TEST_OWNER_URL  owner login, used only to create two orgs
// Skipped when they are not set, so CI without a database stays green.
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

suite('HrmsContextService', () => {
  let appPool: Pool;
  let ownerPool: Pool;
  let service: HrmsContextService;
  const suffix = Date.now().toString(36);
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    appPool = new Pool({ connectionString: appUrl });
    ownerPool = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    service = new HrmsContextService(drizzle(appPool, { schema }));

    // An org must have a CEO by commit, so create the org and its CEO together.
    const make = async (name: string): Promise<string> => {
      const client = await ownerPool.connect();
      try {
        await client.query('begin');
        const user = await client.query<{ id: string }>(
          `insert into hrms.users (email, password_hash, full_name)
           values ($1, 'not-a-real-hash', 'Ctx Test CEO') returning id`,
          [`${name}@ctx-test.invalid`],
        );
        const org = await client.query<{ id: string }>(
          `insert into hrms.orgs (name, plan_code) values ($1, 'standard') returning id`,
          [name],
        );
        await client.query(
          `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo')`,
          [org.rows[0].id, user.rows[0].id],
        );
        await client.query('commit');
        return org.rows[0].id;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    };
    orgA = await make(`ctx-test-a-${suffix}`);
    orgB = await make(`ctx-test-b-${suffix}`);
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  it('sets the four app.* values for the transaction', async () => {
    const row = await service.run(
      { orgId: orgA, memberId: null, userId: '11111111-1111-1111-1111-111111111111', ip: '10.0.0.7' },
      async (tx) => {
        const result = await tx.execute(sql`select
          current_org_id()::text as org, current_member_id()::text as member,
          current_user_id()::text as usr, current_setting('app.client_ip', true) as ip`);
        return result.rows[0] as Record<string, string | null>;
      },
    );

    expect(row).toEqual({
      org: orgA,
      member: null,
      usr: '11111111-1111-1111-1111-111111111111',
      ip: '10.0.0.7',
    });
  });

  it("shows only the current org's rows", async () => {
    const seen = async (orgId: string) =>
      service.run({ orgId }, async (tx) => {
        const result = await tx.execute(
          sql`select id::text from hrms.orgs where name like ${`ctx-test-%-${suffix}`}`,
        );
        return result.rows.map((r) => (r as { id: string }).id);
      });

    expect(await seen(orgA)).toEqual([orgA]);
    expect(await seen(orgB)).toEqual([orgB]);
  });

  it('does not leak settings into the next transaction on the same connection', async () => {
    await service.run({ orgId: orgA }, async () => undefined);
    const org = await service.run({}, async (tx) => {
      const result = await tx.execute(sql`select current_org_id()::text as org`);
      return (result.rows[0] as { org: string | null }).org;
    });

    expect(org).toBeNull();
  });

  it('rolls everything back when the handler throws', async () => {
    const name = `ctx-rollback-${suffix}`;
    await expect(
      service.run({ orgId: orgA }, async (tx) => {
        await tx.execute(sql`insert into hrms.org_holidays (org_id, holiday_date, name)
          values (${orgA}, '2031-01-01', ${name})`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const { rows } = await ownerPool.query(
      'select 1 from hrms.org_holidays where org_id = $1 and name = $2',
      [orgA, name],
    );
    expect(rows).toHaveLength(0);
  });

  it('exposes the transaction only inside a run', async () => {
    expect(() => service.tx).toThrow('No HRMS transaction');
    await service.run({ orgId: orgA }, async (tx) => {
      expect(service.tx).toBe(tx);
    });
  });
});
