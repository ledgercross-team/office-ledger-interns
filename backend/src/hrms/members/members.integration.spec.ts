import { type INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@members-test.invalid`;

suite('HRMS org settings and members (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  const ids: Record<string, string> = {};
  const agents: Record<string, ReturnType<typeof request.agent>> = {};
  const inviteLinks: string[] = [];

  async function user(name: string): Promise<string> {
    const { rows } = await owner.query<{ id: string }>(
      `insert into hrms.users (email, password_hash, full_name) values ($1, $2, $3) returning id`,
      [email(name), await hashPassword(PASSWORD), `Test ${name}`],
    );
    ids[name] = rows[0].id;
    return rows[0].id;
  }

  async function org(name: string, plan: string, ceoUser: string): Promise<string> {
    const client = await owner.connect();
    try {
      await client.query('begin');
      const o = await client.query<{ id: string }>(
        `insert into hrms.orgs (name, plan_code) values ($1, $2) returning id`,
        [`${name}-${suffix}`, plan],
      );
      await client.query(
        `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo')`,
        [o.rows[0].id, ceoUser],
      );
      await client.query('commit');
      return o.rows[0].id;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function member(orgId: string, userName: string, role: string): Promise<string> {
    const client = await owner.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [orgId]);
      const { rows } = await client.query<{ id: string }>(
        `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`,
        [orgId, ids[userName], role],
      );
      await client.query('commit');
      ids[`m_${userName}`] = rows[0].id;
      return rows[0].id;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function signIn(name: string): Promise<void> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email(name), password: PASSWORD });
    expect(res.status).toBe(200);
    agents[name] = agent;
  }

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });

    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      // The mail service logs the invite email; keep just the link.
      const link = typeof message === 'string' ? /(https?:\/\/\S+accept-invite\?token=\S+)/.exec(message) : null;
      if (link) {
        inviteLinks.push(`Invite link: ${link[1]}`);
      }
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'http://localhost:3000',
              HRMS_DATABASE_URL: appUrl,
              JWT_ACCESS_SECRET: 'integration-test-secret-at-least-32-characters-long',
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

    // a plan with exactly one seat, to hit the limit
    await owner.query(
      `insert into hrms.plans (code, name, seat_limit) values ($1, 'Tiny', 1)`,
      [`tiny-${suffix}`],
    );

    const ceoA = await user('ceoA');
    await user('cooA');
    await user('managerA');
    await user('employeeA');
    const ceoB = await user('ceoB');
    const ceoS = await user('ceoS');
    await user('seatHolder');

    ids.orgA = await org('org-a', 'standard', ceoA);
    ids.orgB = await org('org-b', 'standard', ceoB);
    ids.orgS = await org('org-seat', `tiny-${suffix}`, ceoS);
    ids.m_ceoA = (
      await owner.query(`select id from hrms.org_members where org_id = $1 and user_id = $2`, [ids.orgA, ceoA])
    ).rows[0].id;
    await member(ids.orgA, 'cooA', 'coo');
    await member(ids.orgA, 'managerA', 'manager');
    await member(ids.orgA, 'employeeA', 'employee');
    await member(ids.orgS, 'seatHolder', 'employee'); // uses the single seat

    for (const name of ['ceoA', 'cooA', 'managerA', 'employeeA', 'ceoB', 'ceoS']) await signIn(name);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    await owner.end();
  });

  describe('gate: create, invite, accept', () => {
    it('lets the CEO create an employee, who then sets a password from the logged link', async () => {
      const res = await agents.ceoA.post('/api/members').send({
        email: email('newhire'),
        fullName: 'New Hire',
        role: 'employee',
        designation: 'Analyst',
      });

      expect(res.status).toBe(201);
      expect(res.body.invited).toBe(true);
      expect(res.body.member.role).toBe('employee');
      expect(res.body.member.designation).toBe('Analyst');
      expect(JSON.stringify(res.body)).not.toMatch(/password|token|mfa_secret/i);

      expect(inviteLinks).toHaveLength(1);
      const token = new URL(inviteLinks[0].split(': ')[1]).searchParams.get('token')!;

      // the new person cannot sign in before accepting
      const before = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email('newhire'), password: 'whatever-password-123' });
      expect(before.status).toBe(401);

      const accept = await request(app.getHttpServer())
        .post('/api/auth/accept-invite')
        .send({ token, password: 'my-brand-new-password' });
      expect(accept.status).toBe(204);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email('newhire'), password: 'my-brand-new-password' });
      expect(login.status).toBe(200);
      expect(login.body.role).toBe('employee');

      // single use
      const again = await request(app.getHttpServer())
        .post('/api/auth/accept-invite')
        .send({ token, password: 'another-password-123' });
      expect(again.status).toBe(400);
    });

    it('rejects a short password and an unknown token', async () => {
      const short = await request(app.getHttpServer())
        .post('/api/auth/accept-invite')
        .send({ token: 'x'.repeat(40), password: 'short' });
      expect(short.status).toBe(400);

      const unknown = await request(app.getHttpServer())
        .post('/api/auth/accept-invite')
        .send({ token: 'x'.repeat(43), password: 'a-long-enough-password' });
      expect(unknown.status).toBe(400);
    });

    it('attaches an existing login to this org without a new invite', async () => {
      const before = inviteLinks.length;
      const res = await agents.ceoA.post('/api/members').send({
        email: email('seatHolder'),
        fullName: 'ignored',
        role: 'manager',
      });
      expect(res.status).toBe(201);
      expect(res.body.attached).toBe(true);
      expect(res.body.member.fullName).toBe('Test seatHolder');
      expect(inviteLinks).toHaveLength(before);

      const dup = await agents.ceoA.post('/api/members').send({
        email: email('seatHolder'),
        fullName: 'ignored',
        role: 'manager',
      });
      expect(dup.status).toBe(409);
    });
  });

  describe('gate: seat limit', () => {
    it('refuses a new member at the limit with 409 "Seat limit reached", and deactivating frees the seat', async () => {
      const refused = await agents.ceoS.post('/api/members').send({
        email: email('overflow'),
        fullName: 'Over Flow',
        role: 'employee',
      });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/Seat limit reached/);

      // nothing was kept: not the member, not the user
      const leftovers = await owner.query(`select 1 from hrms.users where email = $1`, [email('overflow')]);
      expect(leftovers.rows).toHaveLength(0);

      const seats = await agents.ceoS.get('/api/org');
      expect(seats.body.seats).toMatchObject({ seatLimit: 1, seatsUsed: 1, warningLevel: 100 });

      const freed = await agents.ceoS.post(`/api/members/${ids.m_seatHolder}/deactivate`);
      expect(freed.status).toBe(200);
      expect(freed.body.status).toBe('deactivated');

      const after = await agents.ceoS.get('/api/org');
      expect(after.body.seats.seatsUsed).toBe(0);

      const ok = await agents.ceoS.post('/api/members').send({
        email: email('overflow'),
        fullName: 'Over Flow',
        role: 'employee',
      });
      expect(ok.status).toBe(201);
    });
  });

  describe('gate: org isolation', () => {
    it("keeps org A's members out of org B", async () => {
      const list = await agents.ceoB.get('/api/members');
      expect(list.status).toBe(200);
      const emails = list.body.items.map((m: { email: string }) => m.email);
      expect(emails).toContain(email('ceoB'));
      expect(emails).not.toContain(email('ceoA'));
      expect(emails.some((e: string) => e.startsWith('newhire'))).toBe(false);

      expect((await agents.ceoB.get(`/api/members/${ids.m_managerA}`)).status).toBe(404);
      expect(
        (await agents.ceoB.patch(`/api/members/${ids.m_managerA}`).send({ designation: 'x' })).status,
      ).toBe(404);
      expect((await agents.ceoB.post(`/api/members/${ids.m_managerA}/deactivate`)).status).toBe(404);
    });
  });

  describe('role checks', () => {
    it('limits the list to CEO, COO and managers, and scopes a manager to shared projects', async () => {
      expect((await agents.employeeA.get('/api/members')).status).toBe(403);
      expect((await agents.cooA.get('/api/members')).status).toBe(200);

      const manager = await agents.managerA.get('/api/members');
      expect(manager.status).toBe(200);
      // no shared projects yet: only themselves
      expect(manager.body.items.map((m: { id: string }) => m.id)).toEqual([ids.m_managerA]);
    });

    it('lets everyone read themselves, and nobody else unless scoped', async () => {
      expect((await agents.employeeA.get(`/api/members/${ids.m_employeeA}`)).status).toBe(200);
      expect((await agents.employeeA.get(`/api/members/${ids.m_managerA}`)).status).toBe(404);
      expect((await agents.managerA.get(`/api/members/${ids.m_employeeA}`)).status).toBe(404);
    });

    it('only lets CEO and COO create members, and only a CEO add CEOs and COOs', async () => {
      const body = { email: email('x1'), fullName: 'X One', role: 'employee' };
      expect((await agents.employeeA.post('/api/members').send(body)).status).toBe(403);
      expect((await agents.managerA.post('/api/members').send(body)).status).toBe(403);
      expect(
        (await agents.cooA.post('/api/members').send({ ...body, email: email('x2'), role: 'coo' })).status,
      ).toBe(403);
      expect(
        (await agents.cooA.post('/api/members').send({ ...body, email: email('x3') })).status,
      ).toBe(201);
    });

    it('keeps role and switch changes to CEO/COO, and name/phone to the person', async () => {
      const id = ids.m_employeeA;
      expect((await agents.employeeA.patch(`/api/members/${id}`).send({ role: 'manager' })).status).toBe(403);
      expect((await agents.managerA.patch(`/api/members/${ids.m_managerA}`).send({ canViewAllProjects: true })).status).toBe(403);
      expect((await agents.cooA.patch(`/api/members/${id}`).send({ fullName: 'Hacked' })).status).toBe(403);

      const own = await agents.employeeA.patch(`/api/members/${id}`).send({ phone: '+8801000000', designation: 'Dev' });
      expect(own.status).toBe(200);
      expect(own.body.phone).toBe('+8801000000');

      const promoted = await agents.ceoA.patch(`/api/members/${ids.m_managerA}`).send({
        taskApprovalRequired: true,
      });
      expect(promoted.status).toBe(200);
      expect(promoted.body.taskApprovalRequired).toBe(true);

      // the database's own rule: switches only make sense for managers
      const bad = await agents.ceoA.patch(`/api/members/${id}`).send({ taskApprovalRequired: true });
      expect(bad.status).toBe(422);
    });

    it('limits deactivate to CEO/COO, suspend, downgrade and settings to the CEO', async () => {
      expect((await agents.managerA.post(`/api/members/${ids.m_employeeA}/deactivate`)).status).toBe(403);
      expect((await agents.cooA.post('/api/members/suspend').send({ memberIds: [ids.m_employeeA] })).status).toBe(403);
      expect((await agents.cooA.get('/api/members/downgrade-candidates')).status).toBe(403);
      expect((await agents.cooA.patch('/api/org/settings').send({ lateGraceMinutes: 5 })).status).toBe(403);
      expect((await agents.managerA.post('/api/org/holidays').send({ date: '2031-05-01', name: 'x' })).status).toBe(403);
    });
  });

  describe('org settings', () => {
    it('reads for everyone, seats only for CEO and COO', async () => {
      const ceo = await agents.ceoA.get('/api/org');
      expect(ceo.status).toBe(200);
      expect(ceo.body.seats.seatLimit).toBeGreaterThan(0);
      expect(ceo.body.seats.planCode).toBe('standard');
      expect(ceo.body.settings.weightAttendance).toBe(30);

      const employee = await agents.employeeA.get('/api/org');
      expect(employee.status).toBe(200);
      expect(employee.body.seats).toBeUndefined();
    });

    it('updates settings, and the database refuses weights that do not sum to 100', async () => {
      const ok = await agents.ceoA.patch('/api/org/settings').send({
        lateGraceMinutes: 20,
        workStartTime: '08:30',
        weekendDays: [5, 6],
        workloadAmberTasks: 7,
      });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ lateGraceMinutes: 20, workStartTime: '08:30', weekendDays: [5, 6] });

      const bad = await agents.ceoA.patch('/api/org/settings').send({ weightAttendance: 60 });
      expect(bad.status).toBe(422);

      const good = await agents.ceoA.patch('/api/org/settings').send({
        weightAttendance: 40,
        weightRating: 40,
        weightOntime: 20,
      });
      expect(good.status).toBe(200);

      expect((await agents.ceoA.patch('/api/org/settings').send({ timezone: 'Mars/Phobos' })).status).toBe(400);
      expect((await agents.ceoA.patch('/api/org/settings').send({ nonsense: 1 })).status).toBe(400);
    });

    it('manages office networks, holidays and leave types', async () => {
      const net = await agents.ceoA.post('/api/org/office-networks').send({ network: '203.0.113.0/24', label: 'HQ' });
      expect(net.status).toBe(201);
      expect((await agents.ceoA.get('/api/org/office-networks')).body.items).toHaveLength(1);
      expect((await agents.employeeA.get('/api/org/office-networks')).status).toBe(403);
      expect((await agents.ceoA.delete(`/api/org/office-networks/${net.body.id}`)).status).toBe(204);
      expect((await agents.ceoA.post('/api/org/office-networks').send({ network: 'not-an-ip' })).status).toBe(400);

      const holiday = await agents.ceoA.post('/api/org/holidays').send({ date: '2031-03-26', name: 'Independence Day' });
      expect(holiday.status).toBe(201);
      expect((await agents.employeeA.get('/api/org/holidays?year=2031')).body.items).toEqual([
        { date: '2031-03-26', name: 'Independence Day' },
      ]);
      expect((await agents.ceoA.delete('/api/org/holidays/2031-03-26')).status).toBe(204);

      const types = await agents.employeeA.get('/api/org/leave-types');
      expect(types.body.items.map((t: { code: string }) => t.code).sort()).toEqual(['annual', 'casual', 'sick', 'unpaid']);
      const created = await agents.ceoA.post('/api/org/leave-types').send({
        code: 'study',
        name: 'Study',
        yearlyAllowanceDays: 5,
        isPaid: true,
      });
      expect(created.status).toBe(201);
      const edited = await agents.ceoA.patch(`/api/org/leave-types/${created.body.id}`).send({ yearlyAllowanceDays: 6.5 });
      expect(edited.body.yearlyAllowanceDays).toBe(6.5);
      expect((await agents.cooA.post('/api/org/leave-types').send({ code: 'zz', name: 'Z', yearlyAllowanceDays: 1, isPaid: true })).status).toBe(403);
    });
  });

  describe('suspend and downgrade', () => {
    it('lists candidates oldest-active first and suspends in bulk, freeing seats', async () => {
      const candidates = await agents.ceoA.get('/api/members/downgrade-candidates');
      expect(candidates.status).toBe(200);
      expect(candidates.body.items.length).toBeGreaterThan(0);
      expect(candidates.body.items[0]).toHaveProperty('suggestedOrder', 1);

      const before = (await agents.ceoA.get('/api/org')).body.seats.seatsUsed;
      const res = await agents.ceoA.post('/api/members/suspend').send({
        memberIds: [ids.m_employeeA, ids.m_ceoA],
      });
      expect(res.status).toBe(200);
      expect(res.body.suspended).toEqual([ids.m_employeeA]);
      expect(res.body.skipped).toEqual([ids.m_ceoA]); // CEOs are never suspended this way
      expect((await agents.ceoA.get('/api/org')).body.seats.seatsUsed).toBe(before - 1);

      // and the suspended person is refused on the next request
      expect((await agents.employeeA.get('/api/auth/me')).status).toBe(403);
    });
  });
});
