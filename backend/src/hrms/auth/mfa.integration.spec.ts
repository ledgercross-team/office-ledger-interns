import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../../common/utils/passwords';
import { HrmsModule } from '../hrms.module';
import { totp } from '../auth/mfa';

// Needs a THROWAWAY database loaded with docs/*.sql (see projects.integration.spec.ts).
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@mfa-test.invalid`;

suite('HRMS MFA, history and export (integration)', () => {
  let app: INestApplication;
  let owner: Pool;
  const ids: Record<string, string> = {};
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  async function orgTx<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
    const c = await owner.connect();
    try {
      await c.query('begin');
      await c.query(
        "select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)",
        [ids.org],
      );
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
              DATABASE_URL: appUrl,
              JWT_ACCESS_SECRET: 'integration-test-secret-at-least-32-characters-long',
              JWT_ACCESS_TTL_SECONDS: 900,
              REFRESH_TOKEN_TTL_DAYS: 7,
              COOKIE_SECURE: false,
              MFA_ENCRYPTION_KEY: 'ab'.repeat(32),
            }),
          ],
        }),
        HrmsModule,
      ],
    }).compile();
    const created = moduleRef.createNestApplication();
    created.use(cookieParser());
    created.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await created.init();
    return created;
  }

  const secrets: Record<string, string> = {};

  // Everyone signs in with the password; the authenticator is opt-in from the profile.
  async function signInWithMfa(name: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .send({ email: email(name), password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBeUndefined();
    return agent;
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
        await c.query(
          `insert into hrms.orgs (name, plan_code) values ($1, 'premium') returning id`,
          [`req-${suffix}`],
        )
      ).rows[0].id;
      ids.m_ceo = (
        await c.query(
          `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`,
          [ids.org, ids.ceo],
        )
      ).rows[0].id;
      await c.query('commit');
    } finally {
      c.release();
    }
    await orgTx(async (cl) => {
      const roles: Array<[string, string]> = [
        ['coo', 'coo'],
        ['lead', 'manager'],
        ['emp', 'employee'],
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

    for (const n of ['lead', 'emp']) {
      const agent = request.agent(app.getHttpServer());
      expect(
        (await agent.post('/api/auth/login').send({ email: email(n), password: PASSWORD })).status,
      ).toBe(200);
      agents[n] = agent;
    }
    // CEO and COO sign in with a code (the first sign-in enrols)
    for (const n of ['ceo', 'coo']) agents[n] = await signInWithMfa(n);

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

  it('is off by default, turns on from the profile, then logs in with the code alone', async () => {
    const ceo = agents.ceo;
    expect((await ceo.get('/api/auth/me')).body.user.mfaEnabled).toBe(false);

    // setup needs the password
    expect(
      (await ceo.post('/api/auth/mfa/setup').send({ password: 'wrong wrong wrong' })).status,
    ).toBe(401);
    const setup = await ceo.post('/api/auth/mfa/setup').send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    secrets.ceo = setup.body.secret;

    expect((await ceo.post('/api/auth/mfa/enable').send({ code: '000000' })).status).toBe(401);
    const enabled = await ceo
      .post('/api/auth/mfa/enable')
      .send({ code: totp(secrets.ceo, Date.now()) });
    expect(enabled.status).toBe(200);
    expect(enabled.body.backupCodes).toHaveLength(5);

    // the stored secret is encrypted, never the plain text
    const row = await owner.query(`select mfa_secret_enc from hrms.users where id = $1`, [ids.ceo]);
    expect(Buffer.from(row.rows[0].mfa_secret_enc).toString('utf8')).not.toContain(secrets.ceo);

    // the password no longer signs them in; the code does
    const fresh = request.agent(app.getHttpServer());
    expect(
      (await fresh.post('/api/auth/login').send({ email: email('ceo'), password: PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (await fresh.post('/api/auth/login').send({ email: email('ceo'), password: '000000' }))
        .status,
    ).toBe(401);
    const byCode = await fresh
      .post('/api/auth/login')
      .send({ email: email('ceo'), password: totp(secrets.ceo, Date.now()) });
    expect(byCode.status).toBe(200);

    // a backup code works once
    const backup = enabled.body.backupCodes[0] as string;
    const viaBackup = request.agent(app.getHttpServer());
    expect(
      (await viaBackup.post('/api/auth/login').send({ email: email('ceo'), password: backup }))
        .status,
    ).toBe(200);
    expect(
      (
        await request
          .agent(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: email('ceo'), password: backup })
      ).status,
    ).toBe(401);

    // turning it off needs a code, then the password works again
    expect((await ceo.post('/api/auth/mfa/disable').send({ code: '000000' })).status).toBe(401);
    const off = await ceo
      .post('/api/auth/mfa/disable')
      .send({ code: totp(secrets.ceo, Date.now()) });
    expect(off.status).toBe(204);
    expect(
      (
        await request
          .agent(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: email('ceo'), password: PASSWORD })
      ).status,
    ).toBe(200);

    // a manager signs in with the password alone throughout
    expect((await agents.lead.get('/api/auth/me')).status).toBe(200);
  });

  it('keeps history original and lets only the CEO add notes', async () => {
    const list = await agents.ceo.get('/api/audit?table=projects&pageSize=5');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(list.body)).not.toMatch(/password_hash|mfa_secret/);
    const entry = list.body.items[0];

    expect((await agents.coo.post(`/api/audit/${entry.id}/notes`).send({ note: 'x' })).status).toBe(
      403,
    );
    expect((await agents.lead.get('/api/audit')).status).toBe(403);
    const note = await agents.ceo
      .post(`/api/audit/${entry.id}/notes`)
      .send({ note: 'Checked with the lead' });
    expect(note.status).toBe(201);
    const again = await agents.coo.get(`/api/audit?table=projects&pageSize=5`);
    const same = again.body.items.find((i: { id: string }) => i.id === entry.id);
    expect(same.notes.map((n: { note: string }) => n.note)).toContain('Checked with the lead');
    expect(same.after).toEqual(entry.after);

    // the app login cannot change or delete an entry
    const app_ = new Pool({ connectionString: appUrl, options: '-c search_path=hrms,public' });
    try {
      await expect(
        app_.query(`update hrms.audit_log set action = 'X' where id = $1`, [entry.id]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app_.query(`delete from hrms.audit_log where id = $1`, [entry.id]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await app_.end();
    }
  });

  it('lets only the CEO export the organisation, and works while suspended', async () => {
    expect((await agents.coo.post('/api/org/export').send({})).status).toBe(403);
    expect((await agents.lead.post('/api/org/export').send({})).status).toBe(403);
    const ok = await agents.ceo.post('/api/org/export').send({});
    expect(ok.status).toBe(200);
    expect(ok.body.tables.projects.length).toBeGreaterThan(0);
    expect(JSON.stringify(ok.body)).not.toMatch(/password_hash|mfa_secret/);

    await owner.query(
      `update hrms.orgs set status = 'suspended', suspended_at = now(), purge_after = now() + interval '15 days' where id = $1`,
      [ids.org],
    );
    expect((await agents.ceo.post('/api/org/export').send({})).status).toBe(200);
    expect((await agents.ceo.get('/api/projects')).status).toBe(403);
    await owner.query(`update hrms.orgs set purge_after = now() - interval '1 day' where id = $1`, [
      ids.org,
    ]);
    expect((await agents.ceo.post('/api/org/export').send({})).status).toBe(410);
    await owner.query(
      `update hrms.orgs set status = 'active', suspended_at = null, purge_after = null where id = $1`,
      [ids.org],
    );
  });

  it('review: nothing from another organisation is readable or changeable by id', async () => {
    // a second org with its own CEO, project, task, meeting and request
    const other: Record<string, string> = {};
    const c = await owner.connect();
    try {
      await c.query('begin');
      const u = await c.query(
        `insert into hrms.users (email, password_hash, full_name) values ($1, 'x', 'Other CEO') returning id`,
        [email('otherceo')],
      );
      other.org = (
        await c.query(
          `insert into hrms.orgs (name, plan_code) values ($1, 'premium') returning id`,
          [`other-${suffix}`],
        )
      ).rows[0].id;
      other.ceo = (
        await c.query(
          `insert into hrms.org_members (org_id, user_id, role) values ($1, $2, 'ceo') returning id`,
          [other.org, u.rows[0].id],
        )
      ).rows[0].id;
      await c.query(
        "select set_config('app.org_id', $1, true), set_config('app.member_id', '', true)",
        [other.org],
      );
      other.project = (
        await c.query(
          `insert into hrms.projects (org_id, name, created_by) values ($1, 'Secret', $2) returning id`,
          [other.org, other.ceo],
        )
      ).rows[0].id;
      other.task = (
        await c.query(
          `insert into hrms.tasks (org_id, project_id, title, urgency, due_at, created_by)
           values ($1, $2, 'Secret task', 'low', now() + interval '2 days', $3) returning id`,
          [other.org, other.project, other.ceo],
        )
      ).rows[0].id;
      other.meeting = (
        await c.query(
          `insert into hrms.meetings (org_id, title, starts_at, ends_at, location, created_by)
           values ($1, 'Secret', now() + interval '1 day', now() + interval '2 days', 'Room', $2) returning id`,
          [other.org, other.ceo],
        )
      ).rows[0].id;
      await c.query(
        `insert into hrms.meeting_invitees (org_id, meeting_id, member_id) values ($1, $2, $3)`,
        [other.org, other.meeting, other.ceo],
      );
      await c.query('commit');
    } finally {
      c.release();
    }

    const reads = [
      `/api/projects/${other.project}`,
      `/api/tasks/${other.task}`,
      `/api/tasks/${other.task}/history`,
      `/api/members/${other.ceo}`,
      `/api/meetings/${other.meeting}`,
      `/api/performance/${other.ceo}`,
    ];
    for (const path of reads) {
      const res = await agents.ceo.get(path);
      expect([403, 404]).toContain(res.status);
      expect(res.body.code).not.toBe('ORG_SUSPENDED');
      expect(JSON.stringify(res.body)).not.toContain('Secret');
    }
    // lists never include it
    for (const path of ['/api/projects', '/api/tasks', '/api/members', '/api/audit?pageSize=100']) {
      const res = await agents.ceo.get(path);
      expect(JSON.stringify(res.body)).not.toContain(other.project);
      expect(JSON.stringify(res.body)).not.toContain(other.ceo);
    }
    // writes by id
    const patch = await agents.ceo.patch(`/api/projects/${other.project}`).send({ name: 'Taken' });
    expect([403, 404]).toContain(patch.status);
    const archive = await agents.ceo.post(`/api/projects/${other.project}/archive`).send({});
    expect([403, 404]).toContain(archive.status);
    const respond = await agents.ceo
      .post(`/api/meetings/${other.meeting}/respond`)
      .send({ response: 'accepted' });
    expect([403, 404]).toContain(respond.status);
    const stillThere = await owner.query(`select name from hrms.projects where id = $1`, [
      other.project,
    ]);
    expect(stillThere.rows[0].name).toBe('Secret');
  });
});
