import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../../common/utils/passwords';
import { HrmsModule } from '../hrms.module';
import { HrmsJobsService } from './jobs.service';
import { MailService } from '../mail/mail.service';

// Needs a THROWAWAY database loaded with docs/*.sql (see projects.integration.spec.ts).
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@jobs-test.invalid`;

suite('HRMS jobs (integration)', () => {
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

  async function buildApp(): Promise<INestApplication> {
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
    const created = moduleRef.createNestApplication();
    created.use(cookieParser());
    created.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await created.init();
    return created;
  }

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    app = await buildApp();

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

    await orgTx(async (cl) => {
      ids.leaveType = (
        await cl.query(
          `insert into hrms.leave_types (org_id, code, name, yearly_allowance_days, is_paid)
           values ($1, 'annual', 'Annual', 10, true) on conflict (org_id, code) do update set name = 'Annual' returning id`,
          [ids.org],
        )
      ).rows[0].id;
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





  const resetJobs = () => owner.query('delete from hrms.job_runs');
  const notificationsFor = async (kind: string, entityId: string) =>
    (
      await owner.query(
        `select recipient_id from hrms.notifications where kind = $1 and entity_id = $2 order by id`,
        [kind, entityId],
      )
    ).rows.map((r) => r.recipient_id as string);

  async function expiredLeave(): Promise<string> {
    const day = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    while (day.getUTCDay() !== 2) day.setUTCDate(day.getUTCDate() + 1);
    const d = day.toISOString().slice(0, 10);
    const filed = await agents.emp
      .post('/api/leave')
      .send({ leaveTypeId: ids.leaveType, startDate: d, endDate: d, reason: 'Gate' });
    expect(filed.status).toBe(201);
    const id = filed.body.requestId as string;
    await orgTx((cl) => cl.query(`update hrms.requests set expires_at = now() - interval '1 hour' where id = $1`, [id]));
    return id;
  }

  it('expires a request on the next run and notifies the requester, CEO and COO', async () => {
    const jobs = app.get(HrmsJobsService);
    const id = await expiredLeave();
    await resetJobs();
    const result = await jobs.runJob('expire_pending');
    expect(result.ran).toBe(true);

    const row = await orgTx((cl) => cl.query(`select status::text as status from hrms.requests where id = $1`, [id]));
    expect(row.rows[0].status).toBe('expired');
    const who = await notificationsFor('request_expired', id);
    expect(new Set(who)).toEqual(new Set([ids.m_emp, ids.m_ceo, ids.m_coo]));

    // not due again straight away
    expect((await jobs.runJob('expire_pending')).ran).toBe(false);
  });

  it('expires an unanswered invite and refuses it afterwards', async () => {
    const jobs = app.get(HrmsJobsService);
    const project = await agents.ceo.post('/api/projects').send({ name: `Inv-${suffix}`, managerIds: [ids.m_lead] });
    const sent = await agents.ceo
      .post(`/api/projects/${project.body.id}/invites`)
      .send({ memberId: ids.m_emp });
    expect(sent.status).toBe(201);
    const inviteId = sent.body.id as string;
    await orgTx((cl) =>
      cl.query(`update hrms.project_invites set expires_at = now() - interval '1 hour' where id = $1`, [inviteId]),
    );
    // refused even before the job has marked it
    expect((await agents.emp.post(`/api/invites/${inviteId}/accept`).send({})).status).toBe(409);

    await resetJobs();
    await jobs.runJob('expire_pending');
    const row = await orgTx((cl) => cl.query(`select status::text as status from hrms.project_invites where id = $1`, [inviteId]));
    expect(row.rows[0].status).toBe('expired');
    const who = await notificationsFor('invite_expired', inviteId);
    expect(new Set(who)).toEqual(new Set([ids.m_ceo, ids.m_emp, ids.m_coo]));
    const accept = await agents.emp.post(`/api/invites/${inviteId}/accept`).send({});
    expect(accept.status).toBe(409);
  });

  it('runs each job once with two copies of the API', async () => {
    const second = await buildApp();
    try {
      const a = app.get(HrmsJobsService);
      const b = second.get(HrmsJobsService);
      const id = await expiredLeave();
      await resetJobs();
      const [ra, rb] = await Promise.all([a.runJob('expire_pending'), b.runJob('expire_pending')]);
      expect([ra.ran, rb.ran].filter(Boolean)).toHaveLength(1);
      const who = await notificationsFor('request_expired', id);
      expect(who).toHaveLength(3);
    } finally {
      await second.close();
    }
  });

  it('emails through the log transport and respects the mute preference', async () => {
    const mail = app.get(MailService);
    const send = jest.spyOn(mail, 'send').mockResolvedValue();

    expect((await agents.emp.put('/api/notifications/email-prefs').send({ prefs: [{ kind: 'request_needs_decision', muted: true }] })).status).toBe(400);
    const muted = await agents.emp
      .put('/api/notifications/email-prefs')
      .send({ prefs: [{ kind: 'request_expired', muted: true }] });
    expect(muted.status).toBe(200);

    await owner.query(`update hrms.notifications set email_sent_at = null where kind = 'request_expired'`);
    await resetJobs();
    const jobs = app.get(HrmsJobsService);
    await jobs.runJob('mail_outbox');

    const expired = send.mock.calls
      .map((c) => c[0])
      .filter((m) => m.subject === 'A request expired without a decision')
      .map((m) => m.to);
    expect(expired).toContain(email('ceo'));
    expect(expired).toContain(email('coo'));
    expect(expired).not.toContain(email('emp'));
    send.mockRestore();

    const mine = await agents.ceo.get('/api/notifications');
    expect(mine.status).toBe(200);
    expect(mine.body.unread).toBeGreaterThan(0);
    const first = mine.body.items[0].id as string;
    expect((await agents.ceo.post(`/api/notifications/${first}/read`).send({})).status).toBe(200);
    const all = await agents.ceo.post('/api/notifications/read-all').send({});
    expect(all.status).toBe(200);
    expect((await agents.ceo.get('/api/notifications?unread=true')).body.unread).toBe(0);
  });
});
