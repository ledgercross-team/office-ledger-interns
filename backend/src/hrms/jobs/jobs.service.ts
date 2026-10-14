import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { HrmsContextService } from '../db/hrms-context';
import { describeError } from '../hrms-error.filter';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

type OrgInfo = { id: string; status: string; tz: string };
type OrgJob = (org: OrgInfo) => Promise<number>;

interface JobDefinition {
  name: string;
  everySeconds: number;
  /** Org statuses the job runs for. */
  statuses: string[];
  run: OrgJob;
}

const LIVE = ['active', 'grace', 'read_only'];
const TICK_MS = 60_000;

@Injectable()
export class HrmsJobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('HrmsJobs');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly context: HrmsContextService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    // Off unless HRMS_JOBS_ENABLED is true (env validation defaults it to true for the API).
    if (this.config.get('HRMS_JOBS_ENABLED') !== true) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private readonly jobs: JobDefinition[] = [
    { name: 'expire_pending', everySeconds: 300, statuses: LIVE, run: (o) => this.expirePending(o) },
    { name: 'mail_outbox', everySeconds: 60, statuses: LIVE, run: () => this.sendOutbox() },
    { name: 'high_reminders', everySeconds: 3600, statuses: LIVE, run: () => this.highReminders() },
    { name: 'seat_warnings', everySeconds: 86_400, statuses: LIVE, run: () => this.seatWarnings() },
    { name: 'subscription_lifecycle', everySeconds: 3600, statuses: LIVE, run: (o) => this.lifecycle(o) },
    { name: 'auto_checkout', everySeconds: 300, statuses: LIVE, run: (o) => this.autoCheckout(o) },
    { name: 'compute_performance', everySeconds: 3600, statuses: LIVE, run: (o) => this.computePerformance(o) },
  ];

  get jobNames(): string[] {
    return this.jobs.map((j) => j.name);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of this.jobs) await this.runJob(job.name).catch((e: unknown) => this.logger.error(`${job.name}: ${describeError(e)}`));
    } finally {
      this.running = false;
    }
  }

  /**
   * Runs one job across all orgs if its interval has passed. Everything happens in one
   * transaction under a Postgres advisory lock, so a second API instance that wakes at the
   * same time skips it, and one that wakes later finds job_runs already updated.
   */
  async runJob(name: string, options: { force?: boolean } = {}): Promise<{ ran: boolean; orgs: number; changed: number }> {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) throw new Error(`Unknown job ${name}`);

    return this.context.runSystem(async (tx) => {
      const lock = await tx.execute<{ ok: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtext(${`hrms-job:${name}`})) as ok`,
      );
      if (!lock.rows[0].ok) return { ran: false, orgs: 0, changed: 0 };

      await tx.execute(sql`insert into job_runs (job) values (${name}) on conflict (job) do nothing`);
      const due = await tx.execute<{ due: boolean }>(sql`
        select (last_run_at <= now() - make_interval(secs => ${job.everySeconds})) as due
          from job_runs where job = ${name}`);
      if (!due.rows[0].due && !options.force) return { ran: false, orgs: 0, changed: 0 };

      const orgs = await tx.execute<{ org_id: string; status: string; timezone: string }>(
        sql`select org_id, status::text as status, timezone from list_active_org_ids()`,
      );
      let changed = 0;
      let count = 0;
      for (const [i, o] of orgs.rows.entries()) {
        if (!job.statuses.includes(o.status)) continue;
        const sp = sql.raw(`job_org_${i}`);
        await tx.execute(sql`savepoint ${sp}`);
        try {
          // Jobs act as the system: org set, member empty.
          await tx.execute(sql`select set_config('app.org_id', ${o.org_id}, true), set_config('app.member_id', '', true)`);
          changed += await job.run({ id: o.org_id, status: o.status, tz: o.timezone });
          await tx.execute(sql`release savepoint ${sp}`);
          count += 1;
        } catch (error) {
          await tx.execute(sql`rollback to savepoint ${sp}`);
          this.logger.error(`${name} failed for org ${o.org_id}: ${describeError(error)}`);
        }
      }
      await tx.execute(sql`select set_config('app.org_id', '', true)`);
      await tx.execute(sql`
        update job_runs set last_run_at = now(), last_result = ${JSON.stringify({ orgs: count, changed })}::jsonb
         where job = ${name}`);
      return { ran: true, orgs: count, changed };
    });
  }

  // ---- individual jobs (each runs with app.org_id set to the org) --------------------

  /** People who should hear about something that happened in the org: CEO, COO and the given members. */
  private async ceoCoo(): Promise<string[]> {
    const r = await this.context.tx.execute<{ id: string }>(sql`
      select id from org_members where org_id = current_org_id() and status = 'active' and role in ('ceo', 'coo')`);
    return r.rows.map((x) => x.id);
  }

  private async expirePending(_org: OrgInfo): Promise<number> {
    const tx = this.context.tx;
    const reqs = await tx.execute<{ id: string; requested_by: string; type: string }>(sql`
      select id, requested_by, type::text as type from requests
       where org_id = current_org_id() and status = 'pending' and expires_at < now()`);
    const invites = await tx.execute<{
      id: string;
      invited_by: string;
      invitee_member_id: string;
      project_name: string;
    }>(sql`
      select i.id, i.invited_by, i.invitee_member_id, p.name as project_name
        from project_invites i join projects p on p.id = i.project_id
       where i.org_id = current_org_id() and i.status in ('pending', 'declined') and i.expires_at < now()`);
    if (reqs.rows.length === 0 && invites.rows.length === 0) return 0;

    // The database does the expiring: requests and invites past their working-day window.
    await tx.execute(sql`select job_expire_pending()`);

    const admins = await this.ceoCoo();
    for (const r of reqs.rows) {
      await this.notifications.notify([r.requested_by, ...admins], {
        kind: 'request_expired',
        entityTable: 'requests',
        entityId: r.id,
        title: 'A request expired without a decision',
        body: `The ${r.type.replace(/_/g, ' ')} request was not decided in time.`,
      });
    }
    for (const i of invites.rows) {
      await this.notifications.notify([i.invited_by, i.invitee_member_id, ...admins], {
        kind: 'invite_expired',
        entityTable: 'project_invites',
        entityId: i.id,
        title: `An invite to ${i.project_name} expired`,
        body: 'The invite was not answered or reviewed in time.',
      });
    }
    return reqs.rows.length + invites.rows.length;
  }

  private async highReminders(): Promise<number> {
    const tx = this.context.tx;
    const tasks = await tx.execute<{ id: string; title: string; project_id: string }>(sql`
      update tasks t set high_reminder_sent_at = now()
        from projects p
       where p.id = t.project_id and t.org_id = current_org_id() and t.urgency = 'high' and t.status = 'todo'
         and t.high_reminder_sent_at is null and t.created_at < now() - interval '24 hours'
         and p.status in ('active', 'pending_lead_approval')
      returning t.id, t.title, t.project_id`);
    for (const t of tasks.rows) {
      const who = await tx.execute<{ member_id: string }>(sql`
        select member_id from task_assignees where task_id = ${t.id} and removed_at is null
        union
        select member_id from project_members
         where project_id = ${t.project_id} and role = 'manager' and removed_at is null`);
      await this.notifications.notify(
        who.rows.map((w) => w.member_id),
        {
          kind: 'high_urgency_task',
          entityTable: 'tasks',
          entityId: t.id,
          title: `High-urgency task still in To do: ${t.title}`,
          body: 'It has been waiting for more than 24 hours.',
        },
      );
    }
    return tasks.rows.length;
  }

  /** Once per level: a level is not repeated to the same person within 30 days. */
  private async seatWarnings(): Promise<number> {
    const tx = this.context.tx;
    const u = await tx.execute<{ warning_level: number | null; seats_used: number; seat_limit: number }>(sql`
      select warning_level::int as warning_level, seats_used::int as seats_used, seat_limit::int as seat_limit
        from v_org_seat_usage where org_id = current_org_id()`);
    const level = u.rows[0]?.warning_level;
    if (!level) return 0;
    const admins = await this.ceoCoo();
    let sent = 0;
    for (const id of admins) {
      const seen = await tx.execute(sql`
        select 1 from notifications
         where recipient_id = ${id} and org_id = current_org_id() and kind = 'seat_warning'
           and entity_id is null and title like ${`%${level}%`} and created_at > now() - interval '30 days'`);
      if (seen.rows.length > 0) continue;
      await this.notifications.notify([id], {
        kind: 'seat_warning',
        title: `${level}% of your seats are in use`,
        body: `${u.rows[0].seats_used} of ${u.rows[0].seat_limit} seats are used.`,
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * payment failed -> 7 days grace -> 10 days read-only -> suspended -> data kept 15 days.
   * An unpaid, ended subscription period starts the clock.
   */
  private async lifecycle(org: OrgInfo): Promise<number> {
    const tx = this.context.tx;
    let moved = 0;
    const admins = async (title: string, body: string) =>
      this.notifications.notify(await this.ceoCoo(), { kind: 'subscription_status', title, body });

    if (org.status === 'active') {
      const lapsed = await tx.execute(sql`
        select 1 from orgs o where o.id = current_org_id() and o.payment_failed_at is null
           and exists (select 1 from subscriptions s where s.org_id = o.id)
           and not exists (select 1 from subscriptions s where s.org_id = o.id and s.payment_status = 'paid'
                              and s.current_period_end > now())`);
      if (lapsed.rows.length > 0) {
        await tx.execute(sql`update orgs set payment_failed_at = now() where id = current_org_id()`);
      }
      const failed = await tx.execute(sql`
        update orgs set status = 'grace', grace_ends_at = payment_failed_at + interval '7 days'
         where id = current_org_id() and status = 'active' and payment_failed_at is not null returning id`);
      if (failed.rows.length > 0) {
        await admins('Payment problem: grace period started', 'You have 7 days to fix the payment before the organisation turns read-only.');
        moved += 1;
      }
    } else if (org.status === 'grace') {
      const r = await tx.execute(sql`
        update orgs set status = 'read_only', read_only_ends_at = grace_ends_at + interval '10 days'
         where id = current_org_id() and status = 'grace' and grace_ends_at <= now() returning id`);
      if (r.rows.length > 0) {
        await admins('The organisation is now read-only', 'It becomes suspended after 10 days unless the payment is fixed.');
        moved += 1;
      }
    } else if (org.status === 'read_only') {
      const r = await tx.execute(sql`
        update orgs set status = 'suspended', suspended_at = now(), purge_after = now() + interval '15 days'
         where id = current_org_id() and status = 'read_only' and read_only_ends_at <= now() returning id`);
      if (r.rows.length > 0) {
        await admins('The organisation is suspended', 'Your data is kept for 15 days. The CEO can still export it.');
        moved += 1;
      }
    }
    return moved;
  }

  /** Closes yesterday's open check-ins, and today's once the org's local day is almost over. */
  private async autoCheckout(_org: OrgInfo): Promise<number> {
    const tx = this.context.tx;
    const r = await tx.execute<{ yesterday: string; today: string; late: boolean }>(sql`
      select ((now() at time zone timezone)::date - 1)::text as yesterday,
             (now() at time zone timezone)::date::text as today,
             ((now() at time zone timezone)::time >= time '23:55') as late
        from org_settings where org_id = current_org_id()`);
    const d = r.rows[0];
    if (!d) return 0;
    let n = 0;
    const a = await tx.execute<{ n: number }>(sql`select job_auto_checkout(current_org_id(), ${d.yesterday}::date) as n`);
    n += a.rows[0].n;
    if (d.late) {
      const b = await tx.execute<{ n: number }>(sql`select job_auto_checkout(current_org_id(), ${d.today}::date) as n`);
      n += b.rows[0].n;
    }
    return n;
  }

  /** Nightly: once per local day, after 01:00, until a snapshot for the day exists. */
  private async computePerformance(_org: OrgInfo): Promise<number> {
    const tx = this.context.tx;
    const r = await tx.execute<{ today: string; go: boolean }>(sql`
      select (now() at time zone s.timezone)::date::text as today,
             ((now() at time zone s.timezone)::time >= time '01:00'
              and not exists (select 1 from performance_scores ps
                               where ps.org_id = s.org_id and ps.computed_on = (now() at time zone s.timezone)::date)) as go
        from org_settings s where s.org_id = current_org_id()`);
    const d = r.rows[0];
    if (!d?.go) return 0;
    const n = await tx.execute<{ n: number }>(
      sql`select job_compute_performance(current_org_id(), ${d.today}::date) as n`,
    );
    return n.rows[0].n;
  }

  /** Emails the notifications that need it, skipping what the person muted. */
  private async sendOutbox(): Promise<number> {
    const tx = this.context.tx;
    const frontend = (this.config.get<string>('FRONTEND_URL') ?? '').split(',')[0].trim();
    const rows = await tx.execute<{ id: string; email: string; title: string; body: string | null }>(sql`
      select n.id::text as id, u.email, n.title, n.body
        from notifications n
        join org_members m on m.id = n.recipient_id
        join users u on u.id = m.user_id
       where n.org_id = current_org_id() and n.email_sent_at is null
         and n.created_at > now() - interval '7 days' and m.status = 'active'
         and (n.needs_decision or not exists (
               select 1 from notification_email_prefs p
                where p.member_id = n.recipient_id and p.kind = n.kind and p.email_muted))
       order by n.id limit 200
       for update of n skip locked`);
    let sent = 0;
    for (const r of rows.rows) {
      try {
        await this.mail.send({
          to: r.email,
          subject: r.title,
          text: `${r.title}\n\n${r.body ?? ''}\n\n${frontend}/notifications\n`,
        });
        await tx.execute(sql`update notifications set email_sent_at = now() where id = ${r.id}::bigint`);
        sent += 1;
      } catch (error) {
        this.logger.warn(`Email to ${r.email} failed, will retry: ${describeError(error)}`);
      }
    }
    return sent;
  }
}
