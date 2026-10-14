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
const email = (name: string) => `${name}.${suffix}@calendar-test.invalid`;

suite('HRMS calendar (integration)', () => {
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

    const hash = await hashPassword(PASSWORD);
    const names = ['ceo', 'lead', 'emp'];
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
        ['lead', 'manager'], ['emp', 'employee'],
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
    await orgTx((cl) =>
      cl.query(`update hrms.users set timezone = case id when $1 then 'Asia/Dhaka' else 'America/New_York' end
                 where id in ($1, $2)`, [ids.emp, ids.lead]),
    );
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });



  const startsAt = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  startsAt.setUTCHours(12, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3600 * 1000);
  const base = { title: 'Planning', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };

  it('refuses a meeting with neither link nor location, with both, or with no invitee', async () => {
    const neither = await agents.lead.post('/api/meetings').send({ ...base, inviteeIds: [ids.m_emp] });
    expect(neither.status).toBe(400);
    const both = await agents.lead
      .post('/api/meetings')
      .send({ ...base, inviteeIds: [ids.m_emp], meetingLink: 'https://meet.example.com/x', location: 'Room 1' });
    expect(both.status).toBe(400);
    const none = await agents.lead
      .post('/api/meetings')
      .send({ ...base, location: 'Room 1', inviteeIds: [] });
    expect(none.status).toBe(400);
    expect(
      (await agents.emp.post('/api/meetings').send({ ...base, location: 'Room 1', inviteeIds: [ids.m_lead] })).status,
    ).toBe(403);
  });

  it('shows each person the meeting in their own time zone', async () => {
    const created = await agents.lead
      .post('/api/meetings')
      .send({ ...base, location: 'Room 1', inviteeIds: [ids.m_emp] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const from = base.startsAt.slice(0, 10);

    const dhaka = await agents.emp.get(`/api/calendar?from=${from}&to=${from}T23:59:59Z`);
    const ny = await agents.lead.get(`/api/calendar?from=${from}&to=${from}T23:59:59Z`);
    const find = (r: { body: { items: Array<{ refId: string; startsAtLocal: string }> } }) => r.body.items.find((i) => i.refId === id);
    expect(dhaka.body.timezone).toBe('Asia/Dhaka');
    expect(find(dhaka)).toMatchObject({ startsAtLocal: `${from} 18:00` });
    expect(ny.body.timezone).toBe('America/New_York');
    expect(find(ny)?.startsAtLocal).not.toBe(`${from} 18:00`);

    const responded = await agents.emp.post(`/api/meetings/${id}/respond`).send({ response: 'accepted' });
    expect(responded.status).toBe(200);
    expect((await agents.emp.patch(`/api/meetings/${id}`).send({ title: 'x' })).status).toBe(403);
    const cancelled = await agents.lead.post(`/api/meetings/${id}/cancel`).send({});
    expect(cancelled.body.cancelled).toBe(true);
  });

  it('turns the workload amber at 6 open tasks', async () => {
    const level = async () => {
      const w = await agents.lead.get('/api/workload');
      expect(w.status).toBe(200);
      return w.body.items.find((i: { memberId: string }) => i.memberId === ids.m_emp);
    };
    const due = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    for (let n = 1; n <= 6; n += 1) {
      const t = await agents.ceo
        .post(`/api/projects/${ids.project}/tasks`)
        .send({ title: `T${n}`, urgency: 'low', dueAt: due, assigneeIds: [ids.m_emp] });
      expect(t.status).toBe(201);
      if (n === 5) expect(await level()).toMatchObject({ openTasks: 5, level: 'green' });
    }
    expect(await level()).toMatchObject({ openTasks: 6, level: 'amber' });
    expect((await agents.emp.get('/api/workload')).status).toBe(403);
  });
});
