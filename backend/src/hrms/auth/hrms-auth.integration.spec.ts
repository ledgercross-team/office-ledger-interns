import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../../common/utils/passwords';
import { HrmsModule } from '../hrms.module';

// Needs a THROWAWAY database loaded with docs/*.sql:
//   HRMS_TEST_APP_URL    login as hrms_api
//   HRMS_TEST_OWNER_URL  owner login, used to create fixtures
// Skipped when they are not set, so CI without a database stays green.
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const SECRET = 'integration-test-secret-at-least-32-characters-long';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@auth-test.invalid`;

suite('HRMS auth (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  const ids: Record<string, string> = {};

  const server = () => request(app.getHttpServer());
  const login = (name: string, password = PASSWORD) =>
    server().post('/api/auth/login').send({ email: email(name), password });
  const cookiesOf = (res: request.Response): string[] =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).map((c) => c.split(';')[0]);

  async function asOwner(orgId: string | null, statement: string, params: unknown[] = []) {
    const client = await owner.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [orgId ?? '']);
      const result = await client.query(statement, params);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function makeUser(name: string): Promise<string> {
    const { rows } = await owner.query<{ id: string }>(
      `insert into hrms.users (email, password_hash, full_name) values ($1, $2, $3) returning id`,
      [email(name), await hashPassword(PASSWORD), `Test ${name}`],
    );
    ids[name] = rows[0].id;
    return rows[0].id;
  }

  async function makeOrg(name: string, ceoUser: string): Promise<{ orgId: string; ceoMember: string }> {
    const client = await owner.connect();
    try {
      await client.query('begin');
      const org = await client.query<{ id: string }>(
        `insert into hrms.orgs (name, plan_code) values ($1, 'standard') returning id`,
        [`${name}-${suffix}`],
      );
      const member = await client.query<{ id: string }>(
        `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`,
        [org.rows[0].id, ceoUser],
      );
      await client.query('commit');
      return { orgId: org.rows[0].id, ceoMember: member.rows[0].id };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function addMember(orgId: string, userId: string, role: string): Promise<string> {
    const { rows } = await asOwner(
      orgId,
      `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`,
      [orgId, userId, role],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              HRMS_DATABASE_URL: appUrl,
              JWT_ACCESS_SECRET: SECRET,
              JWT_ACCESS_TTL_SECONDS: 900,
              REFRESH_TOKEN_TTL_DAYS: 7,
              COOKIE_SECURE: false,
            }),
          ],
        }),
        HrmsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // fixtures: org A (ceo + manager + employee), org B (its own ceo), "multi" is in both,
    // org C is blocked, plus a gameMaster
    const ceoA = await makeUser('ceoA');
    await makeUser('manager');
    await makeUser('employee');
    const ceoB = await makeUser('ceoB');
    await makeUser('multi');
    const ceoC = await makeUser('ceoC');
    const gm = await makeUser('gm');

    const a = await makeOrg('org-a', ceoA);
    const b = await makeOrg('org-b', ceoB);
    const c = await makeOrg('org-c', ceoC);
    ids.orgA = a.orgId;
    ids.orgB = b.orgId;
    ids.managerMember = await addMember(a.orgId, ids.manager, 'manager');
    await addMember(a.orgId, ids.employee, 'employee');
    ids.multiInA = await addMember(a.orgId, ids.multi, 'manager');
    ids.multiInB = await addMember(b.orgId, ids.multi, 'employee');

    await owner.query(`insert into hrms.game_masters (user_id, status) values ($1, 'active')`, [gm]);
    await asOwner(
      c.orgId,
      `update hrms.orgs set status = 'blocked', blocked_reason = 'test', blocked_at = now(),
              blocked_by_gm = $1 where id = $2`,
      [gm, c.orgId],
    );
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('logs in a CEO, and /me shows role ceo and the org', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email('ceoA'), password: PASSWORD });

    expect(res.status).toBe(200);
    expect(cookiesOf(res).map((c) => c.split('=')[0])).toEqual(
      expect.arrayContaining(['hrms_access', 'hrms_refresh']),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret/i);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('ceo');
    expect(me.body.org.name).toBe(`org-a-${suffix}`);
    expect(me.body.user.email).toBe(email('ceoA'));
    expect(me.body.needsOrgSelection).toBe(false);
  });

  it('rejects a wrong password and an unknown email with the same 401', async () => {
    const wrong = await login('ceoA', 'not the password');
    const unknown = await server()
      .post('/api/auth/login')
      .send({ email: `nobody.${suffix}@auth-test.invalid`, password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(cookiesOf(wrong)).toHaveLength(0);
  });

  it('gives a two-org user a list, and switch-org changes the active org', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email('multi'), password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.needsOrgSelection).toBe(true);
    expect(res.body.activeMemberId).toBeNull();
    expect(res.body.memberships.map((m: { memberId: string }) => m.memberId).sort()).toEqual(
      [ids.multiInA, ids.multiInB].sort(),
    );

    const first = await agent.post('/api/auth/switch-org').send({ memberId: ids.multiInA });
    expect(first.status).toBe(200);
    expect(first.body.role).toBe('manager');
    expect((await agent.get('/api/auth/me')).body.org.id).toBe(ids.orgA);

    const second = await agent.post('/api/auth/switch-org').send({ memberId: ids.multiInB });
    expect(second.body.role).toBe('employee');
    expect((await agent.get('/api/auth/me')).body.org.id).toBe(ids.orgB);
  });

  it('refuses switching to a membership that is not yours', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: email('multi'), password: PASSWORD });
    const res = await agent.post('/api/auth/switch-org').send({ memberId: ids.managerMember });
    expect(res.status).toBe(403);
  });

  it('refuses a deactivated member on the very next request', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: email('manager'), password: PASSWORD });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    await asOwner(
      ids.orgA,
      `update hrms.org_members set status = 'deactivated', deactivated_at = now() where id = $1`,
      [ids.managerMember],
    );

    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(403);
    expect(after.body.code).toBe('MEMBERSHIP_INACTIVE');
    // and cannot sign in again
    expect((await login('manager')).status).toBe(403);
  });

  it('does not accept a v1 token or v1 cookie', async () => {
    const v1Token = await new JwtService().signAsync(
      { sub: ids.ceoA, role: 'admin', companyId: ids.orgA, tv: 0 },
      { secret: SECRET, algorithm: 'HS256', issuer: 'office-ledger-api', audience: 'office-ledger-web', expiresIn: 600 },
    );

    const asV1Cookie = await server().get('/api/auth/me').set('Cookie', `access_token=${v1Token}`);
    expect(asV1Cookie.status).toBe(401);

    const inV2Cookie = await server().get('/api/auth/me').set('Cookie', `hrms_access=${v1Token}`);
    expect(inV2Cookie.status).toBe(401);
  });

  it('refuses a blocked org at sign-in', async () => {
    const res = await login('ceoC');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
  });

  it('keeps a gameMaster out of org routes and has no org', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email('gm'), password: PASSWORD });
    expect(res.body.isGameMaster).toBe(true);
    expect(res.body.role).toBe('gameMaster');
    expect(res.body.needsOrgSelection).toBe(false);
    expect((await agent.get('/api/auth/me')).body.org).toBeNull();
  });

  it('requires a session for /me and ends it on logout', async () => {
    expect((await server().get('/api/auth/me')).status).toBe(401);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: email('employee'), password: PASSWORD });
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
  });

  it('rotates the refresh token, and revokes the chain when an old one is replayed', async () => {
    const first = await login('ceoB');
    const oldRefresh = cookiesOf(first).find((c) => c.startsWith('hrms_refresh='))!;

    const rotated = await server().post('/api/auth/refresh').set('Cookie', oldRefresh);
    expect(rotated.status).toBe(204);
    const newRefresh = cookiesOf(rotated).find((c) => c.startsWith('hrms_refresh='))!;
    expect(newRefresh).not.toBe(oldRefresh);

    // replaying within the grace window is refused but does not kill the new token
    expect((await server().post('/api/auth/refresh').set('Cookie', oldRefresh)).status).toBe(401);
    expect((await server().post('/api/auth/refresh').set('Cookie', newRefresh)).status).toBe(204);

    // outside the window a replay is theft: every session of the user is revoked
    await owner.query(
      `update hrms.refresh_tokens set revoked_at = now() - interval '5 minutes'
        where user_id = $1 and replaced_by is not null`,
      [ids.ceoB],
    );
    expect((await server().post('/api/auth/refresh').set('Cookie', oldRefresh)).status).toBe(401);
    const live = await owner.query(
      'select count(*)::int as n from hrms.refresh_tokens where user_id = $1 and revoked_at is null',
      [ids.ceoB],
    );
    expect(live.rows[0].n).toBe(0);
  });

  it('changes the password, ends other sessions and accepts the new one', async () => {
    const agent = request.agent(app.getHttpServer());
    const other = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: email('employee'), password: PASSWORD });
    await other.post('/api/auth/login').send({ email: email('employee'), password: PASSWORD });

    const wrong = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'nope', newPassword: 'a-new-long-password' });
    expect(wrong.status).toBe(401);

    const ok = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'a-new-long-password' });
    expect(ok.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await other.post('/api/auth/refresh')).status).toBe(401);
    expect((await login('employee', 'a-new-long-password')).status).toBe(200);
    expect((await login('employee')).status).toBe(401);
  });
});
