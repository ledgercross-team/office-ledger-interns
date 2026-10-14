import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../../common/utils/passwords';
import { HrmsModule } from '../hrms.module';
import { MailService } from '../mail/mail.service';

// Needs a THROWAWAY database loaded with docs/*.sql (see projects.integration.spec.ts).
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@platform-test.invalid`;

suite('HRMS platform (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  const ids: Record<string, string> = {};
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  const config = () => ({
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3000',
    HRMS_DATABASE_URL: appUrl,
    JWT_ACCESS_SECRET: 'integration-test-secret-at-least-32-characters-long',
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 7,
    COOKIE_SECURE: false,
  });

  async function user(name: string, hash: string): Promise<string> {
    const r = await owner.query(
      `insert into hrms.users (email, password_hash, full_name) values ($1, $2, $3) returning id`,
      [email(name), hash, `Test ${name}`],
    );
    return r.rows[0].id;
  }

  async function signIn(name: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email(name), password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [config] }), HrmsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const hash = await hashPassword(PASSWORD);
    for (const n of ['gm1', 'gm3', 'ceo', 'coo', 'mgr']) ids[n] = await user(n, hash);
    // two active gameMasters to start with (bootstrap rows)
    await owner.query(`insert into hrms.game_masters (user_id, status, confirmed_at) values ($1, 'active', now()), ($2, 'active', now())`, [ids.gm1, ids.gm3]);

    // a customer org, made through the platform API
    agents.gm1 = await signIn('gm1');
    agents.gm3 = await signIn('gm3');
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  async function orgTx<T>(orgId: string, fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
    const c = await owner.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)", [orgId]);
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (error) {
      await c.query('rollback');
      throw error;
    } finally {
      c.release();
    }
  }

  it('creates an org with its first CEO and lists counts only', async () => {
    const mail = app.get(MailService);
    const send = jest.spyOn(mail, 'send').mockResolvedValue();
    const created = await agents.gm1
      .post('/api/platform/orgs')
      .send({ name: `Plat-${suffix}`, planCode: 'standard', ceoEmail: email('ceo'), ceoFullName: 'Test ceo' });
    expect(created.status).toBe(201);
    ids.org = created.body.id;
    expect(send).not.toHaveBeenCalled(); // existing account: no invite needed

    const fresh = await agents.gm1
      .post('/api/platform/orgs')
      .send({ name: `Fresh-${suffix}`, planCode: 'standard', ceoEmail: email('freshceo'), ceoFullName: 'Fresh CEO' });
    expect(fresh.status).toBe(201);
    expect(fresh.body.ceoInvited).toBe(true);
    expect(send.mock.calls[0][0].to).toBe(email('freshceo'));
    expect(JSON.stringify(fresh.body)).not.toMatch(/token|password/i);
    send.mockRestore();

    const list = await agents.gm1.get('/api/platform/orgs');
    const mine = list.body.items.find((o: { id: string }) => o.id === ids.org);
    expect(mine).toMatchObject({ ceoCount: 1, cooCount: 0, planCode: 'standard' });
    expect(Object.keys(mine).sort()).toEqual(
      ['cooCount', 'ceoCount', 'id', 'name', 'overThreshold', 'planCode', 'seatLimit', 'seatsUsed', 'status'].sort(),
    );

    // staff for later tests
    await orgTx(ids.org, async (c) => {
      for (const [n, role] of [['coo', 'coo'], ['mgr', 'manager']]) {
        ids[`m_${n}`] = (
          await c.query(`insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`, [
            ids.org,
            ids[n],
            role,
          ])
        ).rows[0].id;
      }
      ids.m_ceo = (await c.query(`select id from hrms.org_members where org_id = $1 and role = 'ceo'`, [ids.org])).rows[0].id;
    });
  });

  it('shows a gameMaster no organisation data at all', async () => {
    const pool = new Pool({ connectionString: appUrl, options: '-c search_path=hrms,public' });
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.user_id', $1, true), set_config('app.org_id', '', true), set_config('app.member_id', '', true)", [
        ids.gm1,
      ]);
      for (const table of [
        'org_members', 'org_settings', 'projects', 'project_members', 'tasks', 'requests', 'leave_requests',
        'attendance_days', 'meetings', 'notifications', 'subscriptions', 'platform_requests', 'performance_scores',
      ]) {
        const r = await c.query(`select count(*)::int as n from hrms.${table}`);
        expect([table, r.rows[0].n]).toEqual([table, 0]);
      }
      await c.query('rollback');
    } finally {
      c.release();
      await pool.end();
    }
    // and no org route answers a gameMaster
    for (const path of ['/api/projects', '/api/members', '/api/tasks', '/api/org']) {
      expect((await agents.gm1.get(path)).status).toBe(403);
    }
    // the platform routes are closed to everyone else
    const ceo = await signIn('ceo');
    expect((await ceo.get('/api/platform/orgs')).status).toBe(403);
  });

  it('does not let a new gameMaster confirm themselves or be confirmed by the person who added them', async () => {
    const created = await agents.gm1
      .post('/api/platform/game-masters')
      .send({ email: email('gm2'), fullName: 'Second GM' });
    expect(created.status).toBe(201);
    ids.gm2 = created.body.userId;
    await owner.query(`update hrms.users set password_hash = (select password_hash from hrms.users where id = $1) where id = $2`, [
      ids.ceo,
      ids.gm2,
    ]);

    // pending: cannot sign in to the console, so cannot confirm anyone
    const pending = request.agent(app.getHttpServer());
    const login = await pending.post('/api/auth/login').send({ email: email('gm2'), password: PASSWORD });
    expect(login.status).toBe(403);
    expect((await pending.post(`/api/platform/game-masters/${ids.gm2}/confirm`).send({})).status).toBe(401);

    // the person who added them cannot confirm either (database rule)
    const byCreator = await agents.gm1.post(`/api/platform/game-masters/${ids.gm2}/confirm`).send({});
    expect(byCreator.status).toBeGreaterThanOrEqual(400);
    expect((await owner.query(`select status::text as s from hrms.game_masters where user_id = $1`, [ids.gm2])).rows[0].s).toBe(
      'pending_confirmation',
    );

    const byOther = await agents.gm3.post(`/api/platform/game-masters/${ids.gm2}/confirm`).send({});
    expect(byOther.status).toBe(200);
    const all = await agents.gm3.get('/api/platform/game-masters');
    expect(all.body.items.find((g: { userId: string }) => g.userId === ids.gm2).status).toBe('active');
  });

  it('refuses a downgrade over the new limit with the database message, and blocks and unblocks', async () => {
    const tiny = (await owner.query(`select code from hrms.plans where seat_limit = 1 limit 1`)).rows[0].code;
    await orgTx(ids.org, async (c) => {
      // the org already has one manager; a second seat takes it over a plan of one
      const u = await c.query(
        `insert into hrms.users (email, password_hash, full_name) values ($1, 'x', 'Extra') returning id`,
        [email('extra')],
      );
      await c.query(`insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'employee')`, [ids.org, u.rows[0].id]);
    });
    const refused = await agents.gm1.post(`/api/platform/orgs/${ids.org}/plan`).send({ planCode: tiny });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/Downgrade blocked/);

    expect((await agents.gm1.post(`/api/platform/orgs/${ids.org}/block`).send({})).status).toBe(400);
    expect((await agents.gm1.post(`/api/platform/orgs/${ids.org}/block`).send({ reason: 'Abuse report' })).status).toBe(200);
    const status = async () =>
      (await agents.gm1.get('/api/platform/orgs')).body.items.find((o: { id: string }) => o.id === ids.org).status;
    expect(await status()).toBe('blocked');
    expect((await agents.gm1.post(`/api/platform/orgs/${ids.org}/unblock`).send({})).status).toBe(200);
    expect(await status()).toBe('active');
  });

  it('recovers a CEO by link to a verified address, never by sharing a password', async () => {
    const mail = app.get(MailService);
    const send = jest.spyOn(mail, 'send').mockResolvedValue();
    const coo = await signIn('coo');
    const ceo = await signIn('ceo');
    expect((await ceo.post('/api/org/recovery-requests').send({ targetMemberId: ids.m_ceo, newEmail: email('newceo') })).status).toBe(403);
    const filed = await coo.post('/api/org/recovery-requests').send({ targetMemberId: ids.m_ceo, newEmail: email('newceo') });
    expect(filed.status).toBe(201);

    const list = await agents.gm1.get('/api/platform/requests');
    const row = list.body.items.find((r: { id: string }) => r.id === filed.body.id);
    expect(row).toMatchObject({ type: 'ceo_recovery', status: 'pending', newEmail: email('newceo') });

    expect((await agents.gm1.post(`/api/platform/requests/${filed.body.id}/verify`).send({})).status).toBe(200);
    expect(send.mock.calls.at(-1)?.[0].to).toBe(email('newceo'));
    expect(send.mock.calls.at(-1)?.[0].text).toMatch(/accept-invite\?token=/);
    send.mockRestore();

    const reset = await owner.query(
      `select count(*)::int as n from hrms.password_resets where user_id = $1 and purpose = 'ceo_recovery'`,
      [ids.ceo],
    );
    expect(reset.rows[0].n).toBe(1);
    const u = await owner.query(`select email::text as email, mfa_enabled from hrms.users where id = $1`, [ids.ceo]);
    expect(u.rows[0]).toMatchObject({ email: email('newceo'), mfa_enabled: false });
  });

  it('removes the last CEO only after verification, ending with exactly one active CEO', async () => {
    // the original CEO signs in again under the new address
    await owner.query(`update hrms.users set email = $1 where id = $2`, [email('ceo'), ids.ceo]);
    const ceo = await signIn('ceo');
    const filed = await ceo.post('/api/org/last-ceo-removal').send({ replacementMemberId: ids.m_mgr });
    expect(filed.status).toBe(201);
    const id = filed.body.id as string;

    // not verified yet: refused
    const early = await agents.gm1.post(`/api/platform/requests/${id}/complete`).send({});
    expect(early.status).toBe(409);
    expect((await agents.gm1.post(`/api/platform/requests/${id}/verify`).send({})).status).toBe(200);
    expect((await agents.gm1.post(`/api/platform/requests/${id}/complete`).send({})).status).toBe(200);

    const ceos = await orgTx(ids.org, (c) =>
      c.query(`select user_id from hrms.org_members where org_id = $1 and role = 'ceo' and status = 'active'`, [ids.org]),
    );
    expect(ceos.rows.map((r) => r.user_id)).toEqual([ids.mgr]);
  });
});
