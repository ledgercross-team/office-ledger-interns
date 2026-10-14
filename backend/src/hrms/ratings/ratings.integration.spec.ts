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
const email = (name: string) => `${name}.${suffix}@ratings-test.invalid`;

suite('HRMS ratings (integration)', () => {
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
    const names = ['ceo', 'coo', 'lead', 'emp'];
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
        ['coo', 'coo'], ['lead', 'manager'], ['emp', 'employee'],
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
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });




  async function completedProject(name: string): Promise<string> {
    const created = await agents.ceo.post('/api/projects').send({ name: `${name}-${suffix}`, managerIds: [ids.m_lead] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await agents.ceo.patch(`/api/projects/${id}/members/${ids.m_lead}/lead`).send({ isLead: true })).status).toBe(200);
    await orgTx((cl) =>
      cl.query(`insert into hrms.project_members (org_id, project_id, member_id, role) values ($1, $2, $3, 'employee')`, [
        ids.org,
        id,
        ids.m_emp,
      ]),
    );
    // one finished task, so the managers can tick
    await orgTx(async (cl) => {
      const t = await cl.query(
        `insert into hrms.tasks (org_id, project_id, title, urgency, due_at, created_by)
         values ($1, $2, 'Done work', 'low', now() + interval '3 days', $3) returning id`,
        [ids.org, id, ids.m_lead],
      );
      await cl.query(
        `insert into hrms.task_assignees (org_id, task_id, member_id, role) values ($1, $2, $3, 'manager'), ($1, $2, $4, 'employee')`,
        [ids.org, t.rows[0].id, ids.m_lead, ids.m_emp],
      );
      for (const status of ['in_progress', 'in_review', 'done']) {
        await cl.query(`update hrms.tasks set status = $2::hrms.task_status where id = $1`, [t.rows[0].id, status]);
      }
    });
    // let the "added" timestamps sit before the completion time
    await new Promise((r) => setTimeout(r, 50));
    expect((await agents.lead.post(`/api/projects/${id}/tick`).send({})).status).toBe(200);
    const done = await agents.lead.post(`/api/projects/${id}/complete`).send({});
    expect(done.status).toBe(200);
    return id;
  }

  it('lists ratings due for the other side only, and takes one batch', async () => {
    ids.p1 = await completedProject('Open');
    const due = await agents.emp.get('/api/me/ratings-due');
    expect(due.status).toBe(200);
    const mine = due.body.items.find((i: { projectId: string }) => i.projectId === ids.p1);
    expect(mine.ratees.map((r: { memberId: string }) => r.memberId)).toEqual([ids.m_lead]);

    const noComment = await agents.emp
      .post(`/api/projects/${ids.p1}/ratings`)
      .send({ ratings: [{ rateeId: ids.m_lead, stars: 2 }] });
    expect(noComment.status).toBe(400);
    const ok = await agents.emp
      .post(`/api/projects/${ids.p1}/ratings`)
      .send({ ratings: [{ rateeId: ids.m_lead, stars: 2, comment: 'Late feedback' }] });
    expect(ok.status).toBe(201);
    const again = await agents.emp
      .post(`/api/projects/${ids.p1}/ratings`)
      .send({ ratings: [{ rateeId: ids.m_lead, stars: 5 }] });
    expect(again.status).toBe(409);
    const after = await agents.emp.get('/api/me/ratings-due');
    expect(after.body.items.some((i: { projectId: string }) => i.projectId === ids.p1)).toBe(false);
    // never exposes who rated whom
    expect(JSON.stringify(after.body)).not.toMatch(/stars|comment/);
  });

  it('refuses ratings once the window has closed', async () => {
    ids.p2 = await completedProject('Closed');
    await orgTx((cl) =>
      cl.query(`update hrms.projects set rating_closes_at = now() - interval '1 day' where id = $1`, [ids.p2]),
    );
    const due = await agents.emp.get('/api/me/ratings-due');
    expect(due.body.items.some((i: { projectId: string }) => i.projectId === ids.p2)).toBe(false);
    const res = await agents.emp
      .post(`/api/projects/${ids.p2}/ratings`)
      .send({ ratings: [{ rateeId: ids.m_lead, stars: 5 }] });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/rating window/i);
  });

  it('keeps performance to the CEO and COO, who see scores after the job runs', async () => {
    expect((await agents.emp.get('/api/performance')).status).toBe(403);
    expect((await agents.lead.get('/api/performance')).status).toBe(403);
    expect((await agents.emp.get(`/api/performance/${ids.m_emp}`)).status).toBe(403);

    await orgTx((cl) => cl.query('select hrms.job_compute_performance($1, current_date)', [ids.org]));
    for (const who of ['ceo', 'coo'] as const) {
      const list = await agents[who].get('/api/performance');
      expect(list.status).toBe(200);
      const row = list.body.items.find((i: { memberId: string }) => i.memberId === ids.m_emp);
      expect(row).toBeDefined();
      expect(row.fullName).toBeDefined();
    }
    const detail = await agents.coo.get(`/api/performance/${ids.m_emp}`);
    expect(detail.status).toBe(200);
    expect(detail.body.attendance).toBeDefined();
    expect(detail.body.history.length).toBeGreaterThan(0);
  });
});
