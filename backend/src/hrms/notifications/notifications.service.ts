import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type { ListNotificationsQueryDto, UpdateEmailPrefsDto } from './dto/notifications.dto';

/** Kinds a person can mute email for. request_needs_decision can never be muted. */
export const MUTABLE_KINDS: Record<string, string> = {
  request_decided: 'Your request was decided',
  request_expired: 'A request or invite expired',
  invite_expired: 'A project invite expired',
  high_urgency_task: 'A high-urgency task is still waiting',
  seat_warning: 'Seats are running out',
  subscription_status: 'Subscription changes',
};

export interface NewNotification {
  kind: string;
  title: string;
  body?: string;
  needsDecision?: boolean;
  entityTable?: string;
  entityId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly context: HrmsContextService) {}

  /** Inside a request or job transaction: the org comes from app.org_id. */
  async notify(recipientIds: string[], n: NewNotification): Promise<void> {
    const recipients = new Set(recipientIds);
    for (const recipient of recipients) {
      await this.context.tx.execute(sql`
        insert into notifications (org_id, recipient_id, kind, needs_decision, entity_table, entity_id, title, body)
        values (current_org_id(), ${recipient}, ${n.kind}, ${n.needsDecision === true},
                ${n.entityTable ?? null}, ${n.entityId ?? null}, ${n.title}, ${n.body ?? null})`);
    }
    if (recipients.size) await this.context.publishRealtime();
  }

  /** Active members the database lets decide this request (never the requester themselves). */
  async notifyDeciders(requestId: string, title: string, body?: string): Promise<void> {
    const rows = await this.context.tx.execute<{ id: string }>(sql`
      select m.id from org_members m, requests r
       where r.id = ${requestId} and m.org_id = current_org_id() and m.status = 'active'
         and m.role in ('ceo', 'coo', 'manager') and m.id <> r.requested_by
         and request_decider_error(r, m.id) is null`);
    await this.notify(
      rows.rows.map((r) => r.id),
      {
        kind: 'request_needs_decision',
        needsDecision: true,
        entityTable: 'requests',
        entityId: requestId,
        title,
        body,
      },
    );
  }

  async list(p: HrmsPrincipal, q: ListNotificationsQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const unreadOnly = q.unread ? sql`and read_at is null` : sql``;
    const rows = await this.context.tx.execute<{
      id: string;
      kind: string;
      needs_decision: boolean;
      entity_table: string | null;
      entity_id: string | null;
      title: string;
      body: string | null;
      created_at: string;
      read_at: string | null;
    }>(sql`
      select id::text as id, kind, needs_decision, entity_table, entity_id, title, body, created_at, read_at
        from notifications
       where recipient_id = ${p.memberId} and org_id = current_org_id() ${unreadOnly}
       order by created_at desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}`);
    const counts = await this.context.tx.execute<{ unread: number; total: number }>(sql`
      select count(*) filter (where read_at is null)::int as unread, count(*)::int as total
        from notifications where recipient_id = ${p.memberId} and org_id = current_org_id()`);
    return {
      items: rows.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        needsDecision: r.needs_decision,
        entityTable: r.entity_table,
        entityId: r.entity_id,
        title: r.title,
        body: r.body,
        createdAt: iso(r.created_at),
        readAt: iso(r.read_at),
      })),
      unread: counts.rows[0].unread,
      total: counts.rows[0].total,
      page,
      pageSize,
    };
  }

  async markRead(p: HrmsPrincipal, id: string) {
    const r = await this.context.tx.execute(sql`
      update notifications set read_at = coalesce(read_at, now())
       where id = ${id}::bigint and recipient_id = ${p.memberId} and org_id = current_org_id()
      returning id`);
    if (r.rows.length === 0) throw new NotFoundException('Notification not found.');
    await this.context.publishRealtime();
    return { ok: true };
  }

  async markAllRead(p: HrmsPrincipal) {
    const r = await this.context.tx.execute(sql`
      update notifications set read_at = now()
       where recipient_id = ${p.memberId} and org_id = current_org_id() and read_at is null returning id`);
    if (r.rows.length) await this.context.publishRealtime();
    return { updated: r.rows.length };
  }

  async prefs(p: HrmsPrincipal) {
    const r = await this.context.tx.execute<{ kind: string; email_muted: boolean }>(sql`
      select kind, email_muted from notification_email_prefs
       where member_id = ${p.memberId} and org_id = current_org_id()`);
    const muted = new Map(r.rows.map((x) => [x.kind, x.email_muted]));
    return {
      items: [
        {
          kind: 'request_needs_decision',
          label: 'A request is waiting for your decision',
          muted: false,
          canMute: false,
        },
        ...Object.entries(MUTABLE_KINDS).map(([kind, label]) => ({
          kind,
          label,
          muted: muted.get(kind) === true,
          canMute: true,
        })),
      ],
    };
  }

  async updatePrefs(p: HrmsPrincipal, dto: UpdateEmailPrefsDto) {
    for (const pref of dto.prefs) {
      if (!(pref.kind in MUTABLE_KINDS)) {
        throw new BadRequestException(
          pref.kind === 'request_needs_decision'
            ? 'Email for requests waiting on your decision cannot be muted.'
            : `Unknown notification kind "${pref.kind}".`,
        );
      }
    }
    for (const pref of dto.prefs) {
      await this.context.tx.execute(sql`
        insert into notification_email_prefs (org_id, member_id, kind, email_muted)
        values (current_org_id(), ${p.memberId}, ${pref.kind}, ${pref.muted})
        on conflict (member_id, kind) do update set email_muted = excluded.email_muted`);
    }
    return this.prefs(p);
  }
}
