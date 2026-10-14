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
const email = (name: string) => `${name}.${suffix}@tasks-test.invalid`;
const due = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

suite('HRMS tasks (integration)', () => {
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
    const names = ['ceo', 'mgrA', 'mgrB', 'mgrSwitch', 'emp'];
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
        await c.query(`insert into hrms.orgs (name, plan_code) values ($1, 'standard') returning id`, [`tasks-${suffix}`])
      ).rows[0].id;
      ids.m_ceo = (
        await c.query(`insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`, [ids.org, ids.ceo])
      ).rows[0].id;
      await c.query('commit');
    } finally {
      c.release();
    }
    await orgTx(async (cl) => {
      for (const [n, role] of [['mgrA', 'manager'], ['mgrB', 'manager'], ['mgrSwitch', 'manager'], ['emp', 'employee']]) {
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

    // a project with three managers and the employee on it
    const created = await agents.ceo
      .post('/api/projects')
      .send({ name: `P-${suffix}`, managerIds: [ids.m_mgrA, ids.m_mgrB, ids.m_mgrSwitch] });
    ids.project = created.body.id;
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

  const url = (id: string, tail = '') => `/api/tasks/${id}${tail}`;

  it('flags a task with nobody on it, and will not start without a manager and an employee', async () => {
    const created = await agents.mgrA
      .post(`/api/projects/${ids.project}/tasks`)
      .send({ title: 'Write the report', urgency: 'high', dueAt: due() });
    expect(created.status).toBe(201);
    ids.task = created.body.id;
    expect(created.body.status).toBe('todo');
    expect(created.body.flags).toMatchObject({ noAssignee: true, noManager: true, noEmployee: true });

    // The employee is on the task, so the staffing rule (not the "on the task" rule) is what stops it.
    const employeeOnly = await agents.mgrA.post(url(ids.task, '/assignees')).send({ memberId: ids.m_emp });
    expect(employeeOnly.status).toBe(201);
    expect(employeeOnly.body.flags).toMatchObject({ noManager: true, noEmployee: false });
    const noManager = await agents.emp.post(url(ids.task, '/status')).send({ status: 'in_progress' });
    expect(noManager.status).toBe(409);
    expect(noManager.body.message).toMatch(/at least one manager and one employee/);

    const full = await agents.mgrA.post(url(ids.task, '/assignees')).send({ memberId: ids.m_mgrA });
    expect(full.body.flags).toMatchObject({ noAssignee: false, noManager: false, noEmployee: false });
    const started = await agents.emp.post(url(ids.task, '/status')).send({ status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
  });

  it('keeps Done to a manager on the task, never the employee', async () => {
    const inReview = await agents.emp.post(url(ids.task, '/status')).send({ status: 'in_review' });
    expect(inReview.status).toBe(200);

    const employee = await agents.emp.post(url(ids.task, '/status')).send({ status: 'done' });
    expect(employee.status).toBe(409);
    expect(employee.body.message).toMatch(/manager on the task/);

    // a manager on the project but not on the task
    const other = await agents.mgrB.post(url(ids.task, '/status')).send({ status: 'done' });
    expect(other.status).toBe(409);
    expect(other.body.message).toMatch(/manager on the task/);
  });

  it('needs a comment to send back and a reason to block', async () => {
    const noComment = await agents.mgrA.post(url(ids.task, '/status')).send({ status: 'in_progress' });
    expect(noComment.status).toBe(409);
    expect(noComment.body.message).toMatch(/comment is required/i);

    const sentBack = await agents.mgrA
      .post(url(ids.task, '/status'))
      .send({ status: 'in_progress', comment: 'Numbers are missing' });
    expect(sentBack.status).toBe(200);
    expect(sentBack.body.statusComment).toBe('Numbers are missing');

    const noReason = await agents.emp.post(url(ids.task, '/status')).send({ status: 'blocked' });
    expect(noReason.status).toBe(400);
    const blocked = await agents.emp
      .post(url(ids.task, '/status'))
      .send({ status: 'blocked', reason: 'Waiting for data' });
    expect(blocked.status).toBe(200);
    expect(blocked.body.blockedReason).toBe('Waiting for data');

    // cancelling also needs a reason
    expect((await agents.mgrA.post(url(ids.task, '/status')).send({ status: 'cancelled' })).status).toBe(400);
  });

  it('lets the manager on the task finish it, and records the history', async () => {
    await agents.emp.post(url(ids.task, '/status')).send({ status: 'in_progress' });
    await agents.emp.post(url(ids.task, '/status')).send({ status: 'in_review' });
    const done = await agents.mgrA.post(url(ids.task, '/status')).send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();
    expect(done.body.flags.noAssignee).toBe(false);

    const history = await agents.mgrA.get(url(ids.task, '/history'));
    const steps = history.body.items.map((h: { toStatus: string }) => h.toStatus);
    expect(steps).toEqual([
      'todo',
      'in_progress',
      'in_review',
      'in_progress',
      'blocked',
      'in_progress',
      'in_review',
      'done',
    ]);
    const blockedStep = history.body.items.find((h: { toStatus: string }) => h.toStatus === 'blocked');
    expect(blockedStep.comment).toBe('Waiting for data');
    expect(blockedStep.changedBy.fullName).toBe('Test emp');
  });

  it('refuses a task from a manager whose approval switch is on, without an approved request', async () => {
    const res = await agents.mgrSwitch
      .post(`/api/projects/${ids.project}/tasks`)
      .send({ title: 'Needs approval', urgency: 'low', dueAt: due() });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/approved create_task request/);

    const left = await owner.query(`select 1 from hrms.tasks where title = 'Needs approval' and org_id = $1`, [ids.org]);
    expect(left.rows).toHaveLength(0);
  });

  it('offers no delete route', async () => {
    expect((await agents.ceo.delete(url(ids.task))).status).toBe(404);
  });
});
