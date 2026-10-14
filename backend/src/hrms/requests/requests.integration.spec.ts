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
const email = (name: string) => `${name}.${suffix}@requests-test.invalid`;
const due = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

suite('HRMS requests (integration)', () => {
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

  const seatsUsed = () =>
    orgTx(async (c) => (await c.query('select hrms.org_seats_used($1) as n', [ids.org])).rows[0].n as number);

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
    const names = ['ceo', 'coo', 'lead', 'mgrB', 'mgrSwitch', 'emp', 'emp2'];
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
        ['coo', 'coo'], ['lead', 'manager'], ['mgrB', 'manager'],
        ['mgrSwitch', 'manager'], ['emp', 'employee'], ['emp2', 'employee'],
      ];
      for (const [n, role] of roles) {
        ids[`m_${n}`] = (
          await cl.query(
            `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`,
            [ids.org, ids[n], role],
          )
        ).rows[0].id;
      }
      await cl.query(`update hrms.org_members set task_approval_required = true where id = $1`, [ids.m_mgrSwitch]);
    });

    for (const n of names) {
      const agent = request.agent(app.getHttpServer());
      expect((await agent.post('/api/auth/login').send({ email: email(n), password: PASSWORD })).status).toBe(200);
      agents[n] = agent;
    }

    const created = await agents.ceo
      .post('/api/projects')
      .send({ name: `P-${suffix}`, managerIds: [ids.m_lead, ids.m_mgrB, ids.m_mgrSwitch] });
    ids.project = created.body.id;
    const tagged = await agents.ceo
      .patch(`/api/projects/${ids.project}/members/${ids.m_lead}/lead`)
      .send({ isLead: true });
    expect(tagged.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('runs create_task end to end: file, approve, create, applied', async () => {
    const filed = await agents.mgrSwitch
      .post('/api/requests')
      .send({ type: 'create_task', projectId: ids.project, reason: 'Need a report' });
    expect(filed.status).toBe(201);
    expect(filed.body.request.status).toBe('pending');
    const id = filed.body.request.id as string;

    // identical pending requests merge
    const again = await agents.mgrSwitch.post('/api/requests').send({ type: 'create_task', projectId: ids.project });
    expect(again.body.merged).toBe(true);
    expect(again.body.request.id).toBe(id);

    const toDecide = await agents.ceo.get('/api/requests?scope=decide');
    expect(toDecide.body.items.map((r: { id: string }) => r.id)).toContain(id);

    const approved = await agents.ceo.post(`/api/requests/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    const task = await agents.mgrSwitch
      .post(`/api/projects/${ids.project}/tasks`)
      .send({ title: 'Report', urgency: 'low', dueAt: due(), requestId: id });
    expect(task.status).toBe(201);

    const after = await agents.mgrSwitch.get(`/api/requests/${id}`);
    expect(after.body.status).toBe('applied');
    expect(after.body.appliedAt).not.toBeNull();
  });

  it('refuses a self-approval (except by a CEO) and shows the reason; reject needs one', async () => {
    const filed = await agents.coo.post('/api/requests').send({ type: 'create_project', name: `COO-${suffix}` });
    expect(filed.status).toBe(201);
    const id = filed.body.request.id as string;
    expect(filed.body.request.canDecide).toBe(false);

    const own = await agents.coo.post(`/api/requests/${id}/approve`).send({});
    expect(own.status).toBe(409);
    expect(own.body.message).toMatch(/own request/);

    expect((await agents.ceo.post(`/api/requests/${id}/reject`).send({})).status).toBe(400);
    const approved = await agents.ceo.post(`/api/requests/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('applied');
    const projects = await agents.ceo.get('/api/projects');
    expect(JSON.stringify(projects.body)).toContain(`COO-${suffix}`);
  });

  it('keeps create_user with the CEO or COO, and holds a seat until decided', async () => {
    const before = await seatsUsed();
    const filed = await agents.lead
      .post('/api/requests')
      .send({ type: 'create_user', email: email('newhire'), fullName: 'New Hire', role: 'employee' });
    expect(filed.status).toBe(201);
    const id = filed.body.request.id as string;
    expect(await seatsUsed()).toBe(before + 1);

    // a lead of a project cannot decide it
    const byLead = await agents.mgrB.post(`/api/requests/${id}/approve`).send({});
    expect(byLead.status).toBe(409);
    expect(byLead.body.message).toMatch(/CEO or COO/);
    expect(await seatsUsed()).toBe(before + 1);

    const approved = await agents.coo.post(`/api/requests/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('applied');
    // the request seat became a member seat: still one
    expect(await seatsUsed()).toBe(before + 1);
    const created = await orgTx((c) =>
      c.query(
        `select om.role::text as role from hrms.org_members om join hrms.users u on u.id = om.user_id
          where u.email = $1`,
        [email('newhire')],
      ),
    );
    expect(created.rows[0].role).toBe('employee');

    // a rejected request gives the seat back
    const second = await agents.lead
      .post('/api/requests')
      .send({ type: 'create_user', email: email('nobody'), fullName: 'Nobody', role: 'employee' });
    expect(await seatsUsed()).toBe(before + 2);
    await agents.ceo
      .post(`/api/requests/${second.body.request.id}/reject`)
      .send({ reason: 'No budget' });
    expect(await seatsUsed()).toBe(before + 1);
  });

  it('lets a manager invite only after add_to_project is approved, then applies it', async () => {
    const direct = await agents.mgrB
      .post(`/api/projects/${ids.project}/invites`)
      .send({ memberId: ids.m_emp2 });
    expect(direct.status).toBe(409);

    const filed = await agents.mgrB
      .post('/api/requests')
      .send({ type: 'add_to_project', projectId: ids.project, subjectMemberId: ids.m_emp2 });
    expect(filed.status).toBe(201);
    const id = filed.body.request.id as string;
    expect((await agents.ceo.post(`/api/requests/${id}/approve`).send({})).status).toBe(200);

    const invite = await agents.mgrB
      .post(`/api/projects/${ids.project}/invites`)
      .send({ memberId: ids.m_emp2, requestId: id });
    expect(invite.status).toBe(201);
    const accepted = await agents.emp2.post(`/api/invites/${invite.body.id}/accept`).send({});
    expect(accepted.status).toBe(200);
    const after = await agents.mgrB.get(`/api/requests/${id}`);
    expect(after.body.status).toBe('applied');
  });

  it('bulk decides several requests and reports each outcome', async () => {
    const mk = (n: string) =>
      agents.lead
        .post('/api/requests')
        .send({ type: 'create_user', email: email(n), fullName: n, role: 'employee' });
    const a = (await mk('bulka')).body.request.id as string;
    const b = (await mk('bulkb')).body.request.id as string;
    const none = await agents.ceo.post('/api/requests/bulk').send({ ids: [a, b], decision: 'reject' });
    expect(none.status).toBe(400);
    const done = await agents.ceo
      .post('/api/requests/bulk')
      .send({ ids: [a, b], decision: 'reject', reason: 'Not now' });
    expect(done.status).toBe(200);
    expect(done.body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    const again = await agents.ceo.post('/api/requests/bulk').send({ ids: [a], decision: 'approve' });
    expect(again.body.results[0].ok).toBe(false);
  });
});
