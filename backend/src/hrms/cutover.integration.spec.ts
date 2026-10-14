import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { hashPassword } from '../common/utils/passwords';
import { HrmsModule } from './hrms.module';
import { totp } from './auth/mfa';
import { MailService } from './mail/mail.service';

// Needs a THROWAWAY database loaded with docs/*.sql (see projects.integration.spec.ts).
const appUrl = process.env.HRMS_TEST_APP_URL;
const ownerUrl = process.env.HRMS_TEST_OWNER_URL;
const suite = appUrl && ownerUrl ? describe : describe.skip;

const PASSWORD = 'correct horse battery staple';
const suffix = Date.now().toString(36);
const email = (name: string) => `${name}.${suffix}@cutover-test.invalid`;

suite('HRMS cutover: a real company, end to end', () => {
  let app: INestApplication;
  let owner: Pool;
  const secrets: Record<string, string> = {};

  const config = () => ({
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: appUrl,
    JWT_ACCESS_SECRET: 'integration-test-secret-at-least-32-characters-long',
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    MFA_ENCRYPTION_KEY: 'cd'.repeat(32),
  });

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl, options: '-c search_path=hrms,public' });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [config] }), HrmsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  // Signs in, enrolling the authenticator on the first time.
  async function signInMfa(name: string, password: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ email: email(name), password });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    if (login.body.mfaEnrollmentRequired) {
      const enrol = await agent.post('/api/auth/mfa/enroll').send({ mfaToken: login.body.mfaToken });
      secrets[name] = enrol.body.secret;
    }
    const done = await agent
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: totp(secrets[name], Date.now()) });
    expect(done.status).toBe(200);
    return agent;
  }

  it('takes a new organisation from gameMaster to a CEO with a member, a project and a task', async () => {
    const mail = app.get(MailService);
    const inbox: Array<{ to: string; text: string }> = [];
    jest.spyOn(mail, 'send').mockImplementation(async (m) => {
      inbox.push({ to: m.to, text: m.text });
    });
    const linkFor = (to: string) => {
      const m = [...inbox].reverse().find((x) => x.to === to);
      return /token=(\S+)/.exec(m?.text ?? '')?.[1] as string;
    };

    // the platform owner (created as the bootstrap script does) signs in and makes the org
    const hash = await hashPassword(PASSWORD);
    const gm = await owner.query(
      `insert into hrms.users (email, password_hash, full_name) values ($1, $2, 'Owner') returning id`,
      [email('gm'), hash],
    );
    await owner.query(`insert into hrms.game_masters (user_id, status, confirmed_at) values ($1, 'active', now())`, [gm.rows[0].id]);
    const platform = await signInMfa('gm', PASSWORD);
    const org = await platform
      .post('/api/platform/orgs')
      .send({ name: `Cutover-${suffix}`, planCode: 'standard', ceoEmail: email('ceo'), ceoFullName: 'Real CEO' });
    expect(org.status).toBe(201);
    expect(org.body.ceoInvited).toBe(true);

    // the CEO sets a password from the emailed link, then signs in with a code
    const token = linkFor(email('ceo'));
    expect(token).toBeTruthy();
    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: 'a long first password' });
    expect(accepted.status).toBe(204);
    const ceo = await signInMfa('ceo', 'a long first password');
    const me = await ceo.get('/api/auth/me');
    expect(me.body.role).toBe('ceo');
    expect(me.body.org.name).toBe(`Cutover-${suffix}`);

    // a member, a project and a task
    const manager = await ceo
      .post('/api/members')
      .send({ email: email('manager'), fullName: 'New Manager', role: 'manager' });
    expect(manager.status).toBe(201);
    const employee = await ceo
      .post('/api/members')
      .send({ email: email('employee'), fullName: 'New Employee', role: 'employee' });
    expect(employee.status).toBe(201);
    expect(linkFor(email('manager'))).toBeTruthy();

    const project = await ceo
      .post('/api/projects')
      .send({ name: 'First project', managerIds: [manager.body.member.id] });
    expect(project.status).toBe(201);
    const task = await ceo.post(`/api/projects/${project.body.id}/tasks`).send({
      title: 'First task',
      urgency: 'medium',
      dueAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      assigneeIds: [manager.body.member.id],
    });
    expect(task.status).toBe(201);
    expect(task.body.status).toBe('todo');

    const listed = await ceo.get(`/api/tasks?projectId=${project.body.id}`);
    expect(listed.body.items.map((t: { title: string }) => t.title)).toEqual(['First task']);
    const people = await ceo.get('/api/members');
    expect(people.body.items.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining([email('ceo'), email('manager'), email('employee')]),
    );
  });
});
