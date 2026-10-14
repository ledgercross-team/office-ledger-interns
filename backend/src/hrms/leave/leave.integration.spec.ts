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
const email = (name: string) => `${name}.${suffix}@leave-test.invalid`;

suite('HRMS leave (integration)', () => {
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
    const names = ['ceo', 'lead', 'emp', 'loner'];
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
        ['lead', 'manager'], ['emp', 'employee'], ['loner', 'employee'],
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
      .send({ name: `P-${suffix}`, managerIds: [ids.m_lead] });
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
    await orgTx(async (cl) => {
      const t = await cl.query(`select id from hrms.leave_types where org_id = $1 and code = 'annual'`, [ids.org]);
      ids.type =
        t.rows[0]?.id ??
        (
          await cl.query(
            `insert into hrms.leave_types (org_id, code, name, yearly_allowance_days, is_paid)
             values ($1, 'annual', 'Annual', 10, true) returning id`,
            [ids.org],
          )
        ).rows[0].id;
      await cl.query(`update hrms.leave_types set yearly_allowance_days = 10 where id = $1`, [ids.type]);
    });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });


  // The Monday that is at least two weeks away, in the current year when possible.
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() + 14);
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
  const day = (offset: number) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const remaining = async (agent: ReturnType<typeof request.agent>) => {
    const res = await agent.get('/api/leave/balance');
    return res.body.items.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.type).remaining as number;
  };

  it('counts working days only, with half days', async () => {
    await orgTx((cl) =>
      cl.query(`insert into hrms.org_holidays (org_id, holiday_date, name) values ($1, $2, 'Test day')`, [
        ids.org,
        day(1),
      ]),
    );
    // Monday (half) to Sunday: Mon 0.5 + Wed Thu Fri; Tuesday is a holiday, the weekend is skipped
    const res = await agents.loner
      .post('/api/leave')
      .send({ leaveTypeId: ids.type, startDate: day(0), endDate: day(6), startHalfDay: true, reason: 'Trip' });
    expect(res.status).toBe(201);
    expect(res.body.days).toBe(3.5);
    ids.lonerLeave = res.body.requestId;
    expect(
      (
        await agents.loner
          .post('/api/leave')
          .send({ leaveTypeId: ids.type, startDate: day(5), endDate: day(6), reason: 'Weekend' })
      ).status,
    ).toBe(400);
  });

  it('sends a no-project person only to the CEO or COO, and the balance drops after approval', async () => {
    const before = await remaining(agents.loner);
    const byLead = await agents.lead.post(`/api/requests/${ids.lonerLeave}/approve`).send({});
    expect(byLead.status).toBe(409);
    const decide = await agents.lead.get('/api/leave?scope=decide');
    expect(decide.body.items.map((i: { requestId: string }) => i.requestId)).not.toContain(ids.lonerLeave);
    const ceoList = await agents.ceo.get('/api/leave?scope=decide');
    expect(ceoList.body.items.map((i: { requestId: string }) => i.requestId)).toContain(ids.lonerLeave);

    expect((await agents.ceo.post(`/api/requests/${ids.lonerLeave}/approve`).send({})).status).toBe(200);
    expect(await remaining(agents.loner)).toBe(before - 3.5);
  });

  it('refuses overlapping approved leave at approval', async () => {
    const second = await agents.loner
      .post('/api/leave')
      .send({ leaveTypeId: ids.type, startDate: day(2), endDate: day(3), reason: 'Overlap' });
    expect(second.status).toBe(201);
    const res = await agents.ceo.post(`/api/requests/${second.body.requestId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Overlaps/);
  });

  it('lets a project lead decide, and the person cancel before it starts', async () => {
    const filed = await agents.emp
      .post('/api/leave')
      .send({ leaveTypeId: ids.type, startDate: day(14), endDate: day(14), reason: 'Appointment' });
    expect(filed.status).toBe(201);
    const id = filed.body.requestId as string;
    const decide = await agents.lead.get('/api/leave?scope=decide');
    expect(decide.body.items.map((i: { requestId: string }) => i.requestId)).toContain(id);

    const cancelled = await agents.emp.post(`/api/leave/${id}/cancel`).send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
  });
});
