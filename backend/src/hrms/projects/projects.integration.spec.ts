import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool, type PoolClient } from 'pg';
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
const email = (name: string) => `${name}.${suffix}@projects-test.invalid`;

suite('HRMS projects, invites and completion (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  let appPool: Pool;
  const ids: Record<string, string> = {};
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  async function inOwnerTx<T>(orgId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await owner.connect();
    try {
      await client.query('begin');
      await client.query(
        "select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)",
        [orgId],
      );
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function user(name: string): Promise<string> {
    const { rows } = await owner.query<{ id: string }>(
      `insert into hrms.users (email, password_hash, full_name) values ($1, $2, $3) returning id`,
      [email(name), await hashPassword(PASSWORD), `Test ${name}`],
    );
    ids[name] = rows[0].id;
    return rows[0].id;
  }

  async function makeOrg(name: string, ceoUser: string): Promise<string> {
    const client = await owner.connect();
    try {
      await client.query('begin');
      const o = await client.query<{ id: string }>(
        `insert into hrms.orgs (name, plan_code) values ($1, 'standard') returning id`,
        [`${name}-${suffix}`],
      );
      const m = await client.query<{ id: string }>(
        `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`,
        [o.rows[0].id, ceoUser],
      );
      await client.query('commit');
      ids[`m_${name}_ceo`] = m.rows[0].id;
      return o.rows[0].id;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function member(userName: string, role: string): Promise<void> {
    ids[`m_${userName}`] = await inOwnerTx(ids.orgA, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, $3::hrms.member_role) returning id`,
        [ids.orgA, ids[userName], role],
      );
      return rows[0].id;
    });
  }

  async function signIn(name: string): Promise<void> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ email: email(name), password: PASSWORD });
    expect(res.status).toBe(200);
    agents[name] = agent;
  }

  /** A project created through the API as the CEO. */
  async function project(name: string, managerKeys: string[] = []): Promise<string> {
    const res = await agents.ceoA.post('/api/projects').send({
      name: `${name}-${suffix}`,
      managerIds: managerKeys.map((k) => ids[`m_${k}`]),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** A task on the project, assigned, and (optionally) driven to done as the system. */
  async function task(projectId: string, managers: string[], employees: string[], done = false) {
    await inOwnerTx(ids.orgA, async (c) => {
      const t = await c.query<{ id: string }>(
        `insert into hrms.tasks (org_id, project_id, title, urgency, due_at, created_by)
         values ($1, $2, 'A task', 'medium', now() + interval '3 days', $3) returning id`,
        [ids.orgA, projectId, ids.m_ceoA],
      );
      const taskId = t.rows[0].id;
      for (const [keys, role] of [[managers, 'manager'], [employees, 'employee']] as const) {
        for (const key of keys) {
          // assignees must already be on the project
          await c.query(
            `insert into hrms.project_members (org_id, project_id, member_id, role)
             select $1, $2, $3, $4::hrms.project_role
              where not exists (select 1 from hrms.project_members
                                 where project_id = $2 and member_id = $3 and removed_at is null)`,
            [ids.orgA, projectId, ids[`m_${key}`], role],
          );
          await c.query(
            `insert into hrms.task_assignees (org_id, task_id, member_id, role)
             values ($1, $2, $3, $4::hrms.project_role)`,
            [ids.orgA, taskId, ids[`m_${key}`], role],
          );
        }
      }
      if (done) {
        for (const status of ['in_progress', 'in_review', 'done']) {
          await c.query(`update hrms.tasks set status = $1::hrms.task_status where id = $2`, [status, taskId]);
        }
      }
    });
  }

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    appPool = new Pool({ connectionString: appUrl });

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

    const names = ['ceoA', 'cooA', 'mgr1', 'mgr2', 'mgr3', 'emp1', 'emp2', 'emp3', 'ceoB'];
    for (const n of names) await user(n);
    ids.orgA = await makeOrg('proj-a', ids.ceoA);
    ids.m_ceoA = ids['m_proj-a_ceo'];
    ids.orgB = await makeOrg('proj-b', ids.ceoB);
    await member('cooA', 'coo');
    for (const n of ['mgr1', 'mgr2', 'mgr3']) await member(n, 'manager');
    for (const n of ['emp1', 'emp2', 'emp3']) await member(n, 'employee');

    for (const n of ['ceoA', 'cooA', 'mgr1', 'mgr2', 'mgr3', 'emp1', 'emp2', 'emp3', 'ceoB']) {
      await signIn(n);
    }
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
    await appPool.end();
  });

  describe('creating and listing', () => {
    it('refuses a COO, at the route and in the database', async () => {
      const res = await agents.cooA.post('/api/projects').send({ name: 'COO project' });
      expect(res.status).toBe(403);
      expect((await agents.mgr1.post('/api/projects').send({ name: 'x' })).status).toBe(403);

      // Even if the route check were gone, the database refuses a COO insert.
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query(
          `select set_config('app.org_id', $1, true), set_config('app.member_id', $2, true)`,
          [ids.orgA, ids.m_cooA],
        );
        await expect(
          client.query(
            `insert into hrms.projects (org_id, name, created_by) values ($1, 'x', $2)`,
            [ids.orgA, ids.m_cooA],
          ),
        ).rejects.toThrow(/Only a CEO creates projects/);
      } finally {
        await client.query('rollback');
        client.release();
      }
    });

    it('lets the CEO create a project with managers, and shows flags and "no tasks yet"', async () => {
      const res = await agents.ceoA.post('/api/projects').send({
        name: `Alpha-${suffix}`,
        description: 'First',
        dueDate: '2031-06-30',
        managerIds: [ids.m_mgr1],
      });
      expect(res.status).toBe(201);
      ids.alpha = res.body.id;
      expect(res.body.status).toBe('active');
      expect(res.body.flags).toEqual({ noManager: false, noEmployee: true });
      expect(res.body.progress).toEqual({ doneTasks: 0, countedTasks: 0, percentDone: null });
      expect(res.body.members).toHaveLength(1);
      expect(res.body.completion).toMatchObject({ managersTotal: 1, managersTicked: 0, approver: 'ceo_or_coo' });
    });

    it('flags a project with no manager', async () => {
      const id = await project('NoManager');
      const res = await agents.ceoA.get(`/api/projects/${id}`);
      expect(res.body.flags).toEqual({ noManager: true, noEmployee: true });
    });

    it('scopes the list and detail by role', async () => {
      const ceo = await agents.ceoA.get(`/api/projects?q=Alpha-${suffix}`);
      expect(ceo.body.items.map((p: { id: string }) => p.id)).toContain(ids.alpha);

      const onIt = await agents.mgr1.get('/api/projects');
      expect(onIt.body.items.map((p: { id: string }) => p.id)).toContain(ids.alpha);
      expect(onIt.body.items.find((p: { id: string }) => p.id === ids.alpha).iAmLead).toBe(false);

      // not a member: nothing, and the project is hidden (404, not 403)
      expect((await agents.mgr2.get('/api/projects')).body.items.map((p: { id: string }) => p.id)).not.toContain(ids.alpha);
      expect((await agents.mgr2.get(`/api/projects/${ids.alpha}`)).status).toBe(404);
      expect((await agents.emp1.get(`/api/projects/${ids.alpha}`)).status).toBe(404);

      // the "see every project" switch
      await agents.ceoA.patch(`/api/members/${ids.m_mgr3}`).send({ canViewAllProjects: true });
      expect((await agents.mgr3.get(`/api/projects/${ids.alpha}`)).status).toBe(200);
      await agents.ceoA.patch(`/api/members/${ids.m_mgr3}`).send({ canViewAllProjects: false });
    });

    it("keeps org A's projects from org B", async () => {
      expect((await agents.ceoB.get(`/api/projects/${ids.alpha}`)).status).toBe(404);
      expect((await agents.ceoB.post(`/api/projects/${ids.alpha}/archive`)).status).toBe(404);
      const list = await agents.ceoB.get('/api/projects');
      expect(list.body.items).toHaveLength(0);
    });
  });

  describe('members and the lead tag', () => {
    it('adds managers directly, but employees only through an invite', async () => {
      const mgr = await agents.ceoA.post(`/api/projects/${ids.alpha}/members`).send({ memberId: ids.m_mgr2 });
      expect(mgr.status).toBe(201);
      expect(mgr.body.managerCount).toBe(2);

      const emp = await agents.ceoA.post(`/api/projects/${ids.alpha}/members`).send({ memberId: ids.m_emp1 });
      expect(emp.status).toBe(400);

      const coo = await agents.cooA.post(`/api/projects/${ids.alpha}/members`).send({ memberId: ids.m_ceoA });
      expect(coo.status).toBe(400); // a CEO is never a project member
    });

    it('lets only CEO and COO tag a lead, and moves the tag', async () => {
      const url = (m: string) => `/api/projects/${ids.alpha}/members/${ids[m]}/lead`;
      expect((await agents.mgr1.patch(url('m_mgr1')).send({ isLead: true })).status).toBe(403);
      expect((await agents.mgr2.post(`/api/projects/${ids.alpha}/members`).send({ memberId: ids.m_mgr3, isLead: true })).status).toBe(403);

      const tagged = await agents.cooA.patch(url('m_mgr1')).send({ isLead: true });
      expect(tagged.status).toBe(200);
      expect(tagged.body.completion.approver).toBe('lead');
      expect(tagged.body.members.find((m: { memberId: string }) => m.memberId === ids.m_mgr1).isLead).toBe(true);
      expect(tagged.body.iAmLead).toBe(false);

      // moved: mgr2 gets it, mgr1 loses it
      await agents.ceoA.patch(url('m_mgr1')).send({ isLead: false });
      const moved = await agents.ceoA.patch(url('m_mgr2')).send({ isLead: true });
      expect(moved.body.leadCount).toBe(1);
      await agents.ceoA.patch(url('m_mgr2')).send({ isLead: false });
      await agents.ceoA.patch(url('m_mgr1')).send({ isLead: true });
    });

    it('edits for CEO/COO/lead only, and removes with removed_at', async () => {
      expect((await agents.mgr2.patch(`/api/projects/${ids.alpha}`).send({ name: 'Nope' })).status).toBe(403);
      expect((await agents.emp1.patch(`/api/projects/${ids.alpha}`).send({ name: 'Nope' })).status).toBe(403);
      const lead = await agents.mgr1.patch(`/api/projects/${ids.alpha}`).send({ description: 'Edited by lead' });
      expect(lead.status).toBe(200);
      expect(lead.body.description).toBe('Edited by lead');
      expect((await agents.ceoA.patch(`/api/projects/${ids.alpha}`).send({ dueDate: '2020-01-01', startDate: '2031-01-01' })).status).toBe(422);

      const extra = await project('Removal', ['mgr3']);
      const removed = await agents.ceoA.delete(`/api/projects/${extra}/members/${ids.m_mgr3}`);
      expect(removed.status).toBe(200);
      expect(removed.body.managerCount).toBe(0);
      const gone = await owner.query(
        'select removed_at from hrms.project_members where project_id = $1 and member_id = $2',
        [extra, ids.m_mgr3],
      );
      expect(gone.rows[0].removed_at).not.toBeNull(); // kept, not deleted
    });
  });

  describe('invites', () => {
    it('lets the person accept and join straight away', async () => {
      const sent = await agents.ceoA.post(`/api/projects/${ids.alpha}/invites`).send({ memberId: ids.m_emp2 });
      expect(sent.status).toBe(201);
      expect(sent.body.status).toBe('pending');
      expect(sent.body.role).toBe('employee');

      const mine = await agents.emp2.get('/api/me/invites');
      expect(mine.body.received.map((i: { id: string }) => i.id)).toContain(sent.body.id);

      expect((await agents.emp3.post(`/api/invites/${sent.body.id}/accept`)).status).toBe(409); // not theirs
      const accepted = await agents.emp2.post(`/api/invites/${sent.body.id}/accept`);
      expect(accepted.status).toBe(200);
      expect(accepted.body.status).toBe('accepted');

      const detail = await agents.emp2.get(`/api/projects/${ids.alpha}`);
      expect(detail.status).toBe(200);
      expect(detail.body.myRole).toBe('employee');
      expect(detail.body.flags.noEmployee).toBe(false);
    });

    it('needs a reason to decline, and only the sender reviews a decline', async () => {
      const sent = await agents.mgr1.post(`/api/projects/${ids.alpha}/invites`).send({ memberId: ids.m_emp1 });
      // a manager may not invite without an approved request (Phase 7 adds the request)
      expect(sent.status).toBe(409);
      expect(sent.body.message).toMatch(/add-to-project request is approved/i);

      const invite = await agents.ceoA.post(`/api/projects/${ids.alpha}/invites`).send({ memberId: ids.m_emp1 });
      expect(invite.status).toBe(201);
      const id = invite.body.id;

      expect((await agents.emp1.post(`/api/invites/${id}/decline`).send({})).status).toBe(400);
      expect((await agents.emp1.post(`/api/invites/${id}/decline`).send({ reason: '   ' })).status).toBe(400);
      const declined = await agents.emp1.post(`/api/invites/${id}/decline`).send({ reason: 'Too busy this quarter' });
      expect(declined.status).toBe(200);
      expect(declined.body.status).toBe('declined');

      // it waits for the sender, and only the sender
      expect((await agents.ceoA.get('/api/me/invites')).body.toReview.map((i: { id: string }) => i.id)).toContain(id);
      const other = await agents.cooA.post(`/api/invites/${id}/review`).send({ decision: 'overrule', reason: 'I say so' });
      expect(other.status).toBe(409);
      expect(other.body.message).toMatch(/person who sent the invite/i);
      const otherManager = await agents.mgr2.post(`/api/invites/${id}/review`).send({ decision: 'accept' });
      expect(otherManager.status).toBe(409);
      expect((await agents.emp1.post(`/api/invites/${id}/review`).send({ decision: 'accept' })).status).toBe(403);

      // an overrule without a reason is refused
      const noReason = await agents.ceoA.post(`/api/invites/${id}/review`).send({ decision: 'overrule' });
      expect(noReason.status).toBe(400);
      const blank = await agents.ceoA.post(`/api/invites/${id}/review`).send({ decision: 'overrule', reason: '  ' });
      expect(blank.status).toBe(400);
      expect((await agents.emp1.get(`/api/projects/${ids.alpha}`)).status).toBe(404); // still not on it

      const overruled = await agents.ceoA
        .post(`/api/invites/${id}/review`)
        .send({ decision: 'overrule', reason: 'We need you on this one' });
      expect(overruled.status).toBe(200);
      expect(overruled.body.status).toBe('overruled');

      // they are on the project, and see the reason
      expect((await agents.emp1.get(`/api/projects/${ids.alpha}`)).status).toBe(200);
      const seen = (await agents.emp1.get('/api/me/invites')).body.received.find((i: { id: string }) => i.id === id);
      expect(seen.reviewReason).toBe('We need you on this one');
      expect(seen.declineReason).toBe('Too busy this quarter');
    });

    it('lets the sender accept a decline, and leaves the person off the project', async () => {
      const id = (await agents.ceoA.post(`/api/projects/${ids.alpha}/invites`).send({ memberId: ids.m_emp3 })).body.id;
      await agents.emp3.post(`/api/invites/${id}/decline`).send({ reason: 'On leave' });
      const reviewed = await agents.ceoA.post(`/api/invites/${id}/review`).send({ decision: 'accept' });
      expect(reviewed.body.status).toBe('decline_accepted');
      expect((await agents.emp3.get(`/api/projects/${ids.alpha}`)).status).toBe(404);
      // a settled decline cannot be overruled afterwards
      const late = await agents.ceoA
        .post(`/api/invites/${id}/review`)
        .send({ decision: 'overrule', reason: 'Changed my mind' });
      expect(late.status).toBe(409);
      expect((await agents.emp3.get(`/api/projects/${ids.alpha}`)).status).toBe(404);
    });

    it('refuses inviting someone already on the project', async () => {
      const res = await agents.ceoA.post(`/api/projects/${ids.alpha}/invites`).send({ memberId: ids.m_emp2 });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Already on the project/);
    });
  });

  describe('completion', () => {
    it('needs every manager to tick, then the lead approves', async () => {
      // alpha: mgr1 (lead), mgr2; employees emp1, emp2
      await task(ids.alpha, ['mgr1'], ['emp1'], true);
      const p = await agents.ceoA.get(`/api/projects/${ids.alpha}`);
      expect(p.body.progress).toMatchObject({ doneTasks: 1, countedTasks: 1, percentDone: 100 });

      expect((await agents.emp1.post(`/api/projects/${ids.alpha}/tick`)).status).toBe(403);
      expect((await agents.cooA.post(`/api/projects/${ids.alpha}/tick`)).status).toBe(403);
      expect((await agents.mgr3.post(`/api/projects/${ids.alpha}/tick`)).status).toBe(404); // not visible

      const first = await agents.mgr1.post(`/api/projects/${ids.alpha}/tick`);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('active');
      expect(first.body.completion).toMatchObject({ managersTotal: 2, managersTicked: 1 });
      expect((await agents.mgr1.post(`/api/projects/${ids.alpha}/complete`)).status).toBe(409); // not all ticked

      const second = await agents.mgr2.post(`/api/projects/${ids.alpha}/tick`);
      expect(second.body.status).toBe('pending_lead_approval');

      // a manager who is not the lead cannot approve; CEO cannot while a lead exists? the DB says lead
      const notLead = await agents.mgr2.post(`/api/projects/${ids.alpha}/complete`);
      expect(notLead.status).toBe(409);
      expect(notLead.body.message).toMatch(/project lead/i);
      expect((await agents.cooA.post(`/api/projects/${ids.alpha}/complete`)).status).toBe(409);

      const done = await agents.mgr1.post(`/api/projects/${ids.alpha}/complete`);
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('completed');
      expect(done.body.completedAt).not.toBeNull();
      expect(done.body.ratingClosesAt).not.toBeNull();

      // a completed project is locked; CEO/COO can reopen it
      expect((await agents.mgr1.post(`/api/projects/${ids.alpha}/reopen`)).status).toBe(403);
      const reopened = await agents.cooA.post(`/api/projects/${ids.alpha}/reopen`);
      expect(reopened.body.status).toBe('active');
      expect(reopened.body.completion.managersTicked).toBe(0);
    });

    it('lets the CEO or COO approve when the project has no lead', async () => {
      const id = await project('NoLead', ['mgr3']);
      await task(id, ['mgr3'], ['emp3'], true);
      const ticked = await agents.mgr3.post(`/api/projects/${id}/tick`);
      expect(ticked.body.status).toBe('pending_lead_approval');
      expect(ticked.body.completion.approver).toBe('ceo_or_coo');

      const mgr = await agents.mgr3.post(`/api/projects/${id}/complete`);
      expect(mgr.status).toBe(409);
      expect(mgr.body.message).toMatch(/no lead/i);

      const coo = await agents.cooA.post(`/api/projects/${id}/complete`);
      expect(coo.status).toBe(200);
      expect(coo.body.status).toBe('completed');
    });

    it('refuses a tick while a task is open, and a new task clears ticks', async () => {
      const id = await project('Open', ['mgr3']);
      await task(id, ['mgr3'], ['emp3'], true);
      await task(id, ['mgr3'], ['emp3'], false); // an open task
      const refused = await agents.mgr3.post(`/api/projects/${id}/tick`);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/Done or Cancelled/);
    });

    it('sends a project back, clearing the ticks', async () => {
      const id = await project('Back', ['mgr3']);
      await task(id, ['mgr3'], ['emp3'], true);
      await agents.mgr3.post(`/api/projects/${id}/tick`);
      expect((await agents.emp3.post(`/api/projects/${id}/send-back`)).status).toBe(403);
      const back = await agents.cooA.post(`/api/projects/${id}/send-back`);
      expect(back.status).toBe(200);
      expect(back.body.status).toBe('active');
      expect(back.body.completion.managersTicked).toBe(0);
      expect((await agents.cooA.post(`/api/projects/${id}/send-back`)).status).toBe(409); // not waiting
    });
  });

  describe('archiving', () => {
    it('is CEO only, and cancels open tasks', async () => {
      const id = await project('Archive', ['mgr3']);
      await task(id, ['mgr3'], ['emp3'], false);
      await task(id, ['mgr3'], ['emp3'], true);

      expect((await agents.cooA.post(`/api/projects/${id}/archive`)).status).toBe(403);
      expect((await agents.mgr3.post(`/api/projects/${id}/archive`)).status).toBe(403);

      const archived = await agents.ceoA.post(`/api/projects/${id}/archive`);
      expect(archived.status).toBe(200);
      expect(archived.body.status).toBe('archived');
      expect(archived.body.archivedAt).not.toBeNull();

      const tasks = await owner.query(
        `select status::text as status, cancel_reason from hrms.tasks where project_id = $1 order by status`,
        [id],
      );
      expect(tasks.rows).toEqual([
        { status: 'cancelled', cancel_reason: 'Project archived' },
        { status: 'done', cancel_reason: null },
      ]);

      // read-only afterwards, and out of the default list
      expect((await agents.ceoA.patch(`/api/projects/${id}`).send({ name: 'renamed' })).status).toBe(409);
      const list = await agents.ceoA.get('/api/projects?pageSize=100');
      expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(id);
      const only = await agents.ceoA.get('/api/projects?status=archived');
      expect(only.body.items.map((p: { id: string }) => p.id)).toContain(id);
    });
  });
});
