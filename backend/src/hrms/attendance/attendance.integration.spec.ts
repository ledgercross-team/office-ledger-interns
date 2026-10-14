import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../../common/utils/passwords';
import { HrmsModule } from '../hrms.module';

// Needs a THROWAWAY database loaded with docs/*.sql (see projects.integration.spec.ts).
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@attendance-test.invalid`;

suite('HRMS attendance (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  const ids: Record<string, string> = {};
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  async function orgTx<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
    const c = await owner.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)", [ids.org]);
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

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'http://localhost:3000',
              DATABASE_URL: appUrl,
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

    const hash = await hashPassword(PASSWORD);
    const names = ['ceo', 'lead', 'mgrB', 'emp'];
    for (const n of names) {
      const { rows } = await owner.query(
        `insert into hrms.users (email, password_hash, full_name) values ($1, $2, $3) returning id`,
        [email(n), hash, `Test ${n}`],
      );
      ids[n] = rows[0].id;
    }
    const c = await owner.connect();
    try {
      await c.query('begin');
      ids.org = (
        await c.query(`insert into hrms.orgs (name, plan_code) values ($1, 'premium') returning id`, [`req-${suffix}`])
      ).rows[0].id;
      ids.m_ceo = (
        await c.query(`insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`, [ids.org, ids.ceo])
      ).rows[0].id;
      await c.query('commit');
    } finally {
      c.release();
    }
    await orgTx(async (cl) => {
      const roles: Array<[string, string]> = [
        ['lead', 'manager'], ['mgrB', 'manager'], ['emp', 'employee'],
      ];
      for (const [n, role] of roles) {
        ids[`m_${n}`] = (
          await cl.query(
            `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`,
            [ids.org, ids[n], role],
          )
        ).rows[0].id;
      }
    });

    for (const n of names) {
      const agent = request.agent(app.getHttpServer());
      expect((await agent.post('/api/auth/login').send({ email: email(n), password: PASSWORD })).status).toBe(200);
      agents[n] = agent;
    }

    const created = await agents.ceo
      .post('/api/projects')
      .send({ name: `P-${suffix}`, managerIds: [ids.m_lead, ids.m_mgrB] });
    ids.project = created.body.id;
    const tagged = await agents.ceo
      .patch(`/api/projects/${ids.project}/members/${ids.m_lead}/lead`)
      .send({ isLead: true });
    expect(tagged.status).toBe(200);
    await orgTx((cl) =>
      cl.query(
        `insert into hrms.project_members (org_id, project_id, member_id, role) values ($1, $2, $3, 'employee')`,
        [ids.org, ids.project, ids.m_emp],
      ),
    );
    await orgTx((cl) =>
      cl.query(
        `insert into hrms.org_office_networks (org_id, network, label) values ($1, '10.9.9.0/24', 'HQ')`,
        [ids.org],
      ),
    );
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  it('refuses a check-in from outside the office network with a clear message', async () => {
    const res = await agents.emp.post('/api/attendance/check-in').send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/office network/);
  });

  it('shows late after work start plus grace', async () => {
    await orgTx(async (cl) => {
      await cl.query(`insert into hrms.org_office_networks (org_id, network, label) values ($1, '127.0.0.0/8', 'Local')`, [ids.org]);
      await cl.query(`update hrms.org_settings set work_start_time = '00:00', late_grace_minutes = 0 where org_id = $1`, [ids.org]);
    });
    const res = await agents.emp.post('/api/attendance/check-in').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('late');
    expect((await agents.emp.post('/api/attendance/check-in').send({})).status).toBe(409);
    const out = await agents.emp.post('/api/attendance/check-out').send({});
    expect(out.status).toBe(200);
    expect(out.body.checkOutAt).not.toBeNull();
  });

  it('changes the day after an approved correction and keeps the original', async () => {
    await orgTx((cl) =>
      cl.query(`update hrms.org_settings set work_start_time = '09:00', late_grace_minutes = 15 where org_id = $1`, [ids.org]),
    );
    const filed = await agents.emp
      .post('/api/attendance/corrections')
      .send({ workDate: today, checkInAt: `${today}T00:05:00Z`, checkOutAt: `${today}T00:06:00Z`, reason: 'Forgot to tap' });
    expect(filed.status).toBe(201);
    const id = filed.body.requestId as string;

    // an employee cannot decide it; a manager who is not a lead cannot either
    expect((await agents.emp.post(`/api/requests/${id}/approve`).send({})).status).toBe(403);
    expect((await agents.mgrB.post(`/api/requests/${id}/approve`).send({})).status).toBe(409);
    const approved = await agents.lead.post(`/api/requests/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('applied');

    const mine = await agents.emp.get(`/api/attendance/me?month=${month}`);
    expect(mine.status).toBe(200);
    const day = mine.body.days.find((d: { date: string }) => d.date === today);
    expect(day.status).toBe('present');
    expect(day.corrected).toBe(true);
    const history = mine.body.corrections.find((c: { requestId: string }) => c.requestId === id);
    expect(history.status).toBe('applied');
    expect(history.original.status).toBe('late');
  });

  it('shows the team to the lead, and exports a CSV', async () => {
    const team = await agents.lead.get(`/api/attendance?date=${today}`);
    expect(team.status).toBe(200);
    expect(team.body.items.map((i: { memberId: string }) => i.memberId)).toContain(ids.m_emp);
    expect((await agents.emp.get('/api/attendance')).status).toBe(403);
    const csv = await agents.ceo.get(`/api/attendance/report?month=${month}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Name,Email,Role');
  });
});
