import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import { NotificationsService } from '../notifications/notifications.service';
import type { FileReportDto, GmStartThreadDto, StartThreadDto } from './dto/messages.dto';

/** Who each org role may start a conversation with. The database enforces the same table. */
const CONTACTABLE: Record<string, string[]> = {
  ceo: ['coo', 'manager'],
  coo: ['ceo', 'manager', 'employee'],
  manager: ['ceo', 'coo', 'manager', 'employee'],
  employee: ['coo', 'manager', 'employee'],
};
const SUGGESTIONS = 8;

function needle(q: string | undefined): string | null {
  const text = q?.trim();
  return text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

interface ThreadRow extends Record<string, unknown> {
  conversation_id: string;
  other_user: string;
  other_name: string;
  other_role: string | null;
  last_message_at: string;
  last_body: string | null;
  unread: number;
  org_name?: string;
}

function toThread(r: ThreadRow) {
  return {
    id: r.conversation_id,
    otherUserId: r.other_user,
    otherName: r.other_name,
    otherRole: r.other_role,
    orgName: r.org_name ?? null,
    lastMessageAt: iso(r.last_message_at),
    lastBody: r.last_body,
    unread: r.unread,
  };
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly context: HrmsContextService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- people you may write to -------------------------------------------
  async recipients(p: HrmsPrincipal, q?: string, role?: string) {
    const allowed = CONTACTABLE[p.role ?? ''] ?? [];
    if (allowed.length === 0) return { items: [] };
    const roles = role ? allowed.filter((r) => r === role) : allowed;
    const like = needle(q);
    // Typing a role ("manager", "coos") finds that role's people, so no name has to be remembered.
    const word = q?.trim().toLowerCase().replace(/s$/, '') ?? '';
    const roleLike = word.length >= 2 ? `${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const items: Array<{ userId: string; fullName: string; role: string }> = [];

    if (roles.length > 0) {
      const list = sql.join(
        roles.map((r) => sql`${r}::member_role`),
        sql`, `,
      );
      const people = await this.context.tx.execute<{
        user_id: string;
        full_name: string;
        role: string;
      }>(sql`
        select m.user_id, u.full_name, m.role::text as role
          from org_members m join users u on u.id = m.user_id
         where m.org_id = current_org_id() and m.status = 'active' and m.role in (${list})
           and m.user_id <> ${p.userId}
           and (${like}::text is null or u.full_name ilike ${like} or u.email::text ilike ${like}
                or m.role::text like ${roleLike}::text)
         order by u.full_name limit ${SUGGESTIONS}`);
      for (const r of people.rows)
        items.push({ userId: r.user_id, fullName: r.full_name, role: r.role });
    }

    const wantsGms = (!role || role === 'gameMaster') && (p.role === 'ceo' || p.role === 'coo');
    if (wantsGms && items.length < SUGGESTIONS) {
      const gms = await this.context.tx.execute<{ user_id: string; full_name: string }>(sql`
        select user_id, full_name from list_game_masters()
         where ${like}::text is null or full_name ilike ${like} or 'gamemaster' like ${roleLike}::text
         limit ${SUGGESTIONS - items.length}`);
      for (const g of gms.rows)
        items.push({ userId: g.user_id, fullName: g.full_name, role: 'gameMaster' });
    }
    return { items };
  }

  // ---- conversations -------------------------------------------------------
  async threads(p: HrmsPrincipal) {
    const me = p.userId;
    const rows = await this.context.tx.execute<ThreadRow>(sql`
      select c.id as conversation_id,
             o.other_user, u.full_name as other_name, message_role_of(o.other_user, c.org_id) as other_role,
             c.last_message_at,
             (select m.body from messages m where m.conversation_id = c.id
                 and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = ${me})
               order by m.id desc limit 1) as last_body,
             (select count(*)::int from messages m where m.conversation_id = c.id
                 and m.sender_user <> ${me} and m.read_at is null
                 and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = ${me})) as unread
        from conversations c
        cross join lateral (select case when c.user_lo = ${me} then c.user_hi else c.user_lo end as other_user) o
        join users u on u.id = o.other_user
       where c.org_id = current_org_id() and ${me} in (c.user_lo, c.user_hi)
       order by c.last_message_at desc limit 200`);
    return { items: rows.rows.map(toThread) };
  }

  async thread(p: HrmsPrincipal, id: string) {
    const me = p.userId;
    const head = await this.context.tx.execute<{
      other_user: string;
      other_name: string;
      other_role: string | null;
    }>(sql`
      select o.other_user, u.full_name as other_name, message_role_of(o.other_user, c.org_id) as other_role
        from conversations c
        cross join lateral (select case when c.user_lo = ${me} then c.user_hi else c.user_lo end as other_user) o
        join users u on u.id = o.other_user
       where c.id = ${id}::uuid and c.org_id = current_org_id() and ${me} in (c.user_lo, c.user_hi)`);
    const h = head.rows[0];
    if (!h) throw new NotFoundException('Conversation not found.');
    const msgs = await this.context.tx.execute<{
      id: string;
      mine: boolean;
      body: string;
      sent_at: string;
      read_at: string | null;
    }>(sql`
      select m.id::text as id, (m.sender_user = ${me}) as mine, m.body, m.sent_at, m.read_at
        from messages m
       where m.conversation_id = ${id}::uuid
         and not exists (select 1 from message_hidden x where x.message_id = m.id and x.user_id = ${me})
       order by m.id`);
    return {
      id,
      otherUserId: h.other_user,
      otherName: h.other_name,
      otherRole: h.other_role,
      // Inactive people close a thread; the database also refuses the send.
      closed: h.other_role === null,
      messages: msgs.rows.map((m) => ({
        id: m.id,
        mine: m.mine,
        body: m.body,
        sentAt: iso(m.sent_at),
        readAt: iso(m.read_at),
      })),
    };
  }

  /** Finds or makes the one conversation between you and them, then sends the first message. */
  async start(p: HrmsPrincipal, dto: StartThreadDto) {
    if (dto.toUserId === p.userId) throw new BadRequestException('You cannot message yourself.');
    const tx = this.context.tx;
    const lo = p.userId < dto.toUserId ? p.userId : dto.toUserId;
    const hi = p.userId < dto.toUserId ? dto.toUserId : p.userId;
    // The database rules decide whether this pair may talk; its message reaches the person as is.
    const made = await tx.execute<{ id: string }>(sql`
      insert into conversations (org_id, user_lo, user_hi, created_by)
      values (current_org_id(), ${lo}::uuid, ${hi}::uuid, ${p.userId}::uuid)
      on conflict (org_id, user_lo, user_hi) do update set last_message_at = conversations.last_message_at
      returning id`);
    const conversationId = made.rows[0].id;
    const messageId = await this.insertMessage(conversationId, p.userId, dto.body);
    return { conversationId, messageId };
  }

  async reply(p: HrmsPrincipal, conversationId: string, body: string) {
    const c = await this.context.tx.execute(sql`
      select 1 from conversations
       where id = ${conversationId}::uuid and org_id = current_org_id() and ${p.userId}::uuid in (user_lo, user_hi)`);
    if (c.rows.length === 0) throw new NotFoundException('Conversation not found.');
    const messageId = await this.insertMessage(conversationId, p.userId, body);
    return { conversationId, messageId };
  }

  private async insertMessage(
    conversationId: string,
    sender: string,
    body: string,
  ): Promise<string> {
    const r = await this.context.tx.execute<{ id: string }>(sql`
      insert into messages (conversation_id, org_id, sender_user, body)
      values (${conversationId}::uuid, current_org_id(), ${sender}::uuid, ${body}) returning id::text as id`);
    return r.rows[0].id;
  }

  async markRead(p: HrmsPrincipal, conversationId: string): Promise<void> {
    await this.context.tx.execute(sql`
      update messages set read_at = now()
       where conversation_id = ${conversationId}::uuid and sender_user <> ${p.userId}::uuid and read_at is null`);
  }

  async hide(p: HrmsPrincipal, messageId: string): Promise<void> {
    const visible = await this.context.tx.execute(
      sql`select 1 from messages where id = ${messageId}::bigint`,
    );
    if (visible.rows.length === 0) throw new NotFoundException('Message not found.');
    await this.context.tx.execute(sql`
      insert into message_hidden (message_id, user_id) values (${messageId}::bigint, ${p.userId}::uuid)
      on conflict do nothing`);
  }

  /** Unread messages plus unread report replies, for the nav badge. */
  async unreadCount(p: HrmsPrincipal): Promise<{ messages: number; reports: number }> {
    const tx = this.context.tx;
    const m = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from messages x
       where x.org_id = current_org_id() and x.sender_user <> ${p.userId}::uuid and x.read_at is null
         and not exists (select 1 from message_hidden h where h.message_id = x.id and h.user_id = ${p.userId}::uuid)`);
    let reports = 0;
    if (p.role === 'ceo') {
      const r = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from report_messages where from_reporter and read_at is null`);
      reports = r.rows[0].n;
    } else {
      const r = await tx.execute<{ n: number }>(
        sql`select coalesce(sum(unread), 0)::int as n from my_reports()`,
      );
      reports = r.rows[0].n;
    }
    return { messages: m.rows[0].n, reports };
  }

  // ---- reports to the CEO ---------------------------------------------------
  async reportRecipients() {
    const r = await this.context.tx.execute<{ user_id: string; full_name: string }>(sql`
      select m.user_id, u.full_name from org_members m join users u on u.id = m.user_id
       where m.org_id = current_org_id() and m.role = 'ceo' and m.status = 'active' order by u.full_name`);
    return { items: r.rows.map((x) => ({ userId: x.user_id, fullName: x.full_name })) };
  }

  async fileReport(p: HrmsPrincipal, dto: FileReportDto) {
    const tx = this.context.tx;
    const made = await tx.execute<{ id: string }>(sql`
      select file_report(${dto.ceoUserId}::uuid, ${dto.subject}, ${dto.body}, ${dto.anonymous}) as id`);
    const reportId = made.rows[0].id;
    // The notification names nothing about the sender.
    const ceo = await tx.execute<{ id: string }>(sql`
      select id from org_members where user_id = ${dto.ceoUserId}::uuid and org_id = current_org_id() and role = 'ceo'`);
    if (ceo.rows[0]) {
      await this.notifications.notify([ceo.rows[0].id], {
        kind: 'report_received',
        title: 'You have a new report',
        entityTable: 'reports',
        entityId: reportId,
      });
    }
    return { reportId };
  }

  async reportsForCeo() {
    const r = await this.context.tx.execute<{
      id: string;
      subject: string;
      is_anonymous: boolean;
      reporter_name: string | null;
      created_at: string;
      last_message_at: string;
      unread: number;
    }>(sql`
      select r.id, r.subject, r.is_anonymous, r.reporter_name, r.created_at, r.last_message_at,
             (select count(*)::int from report_messages m where m.report_id = r.id and m.from_reporter and m.read_at is null) as unread
        from reports r where r.org_id = current_org_id() order by r.last_message_at desc limit 200`);
    return {
      items: r.rows.map((x) => ({
        id: x.id,
        subject: x.subject,
        anonymous: x.is_anonymous,
        reporterName: x.reporter_name,
        createdAt: iso(x.created_at),
        lastMessageAt: iso(x.last_message_at),
        unread: x.unread,
      })),
    };
  }

  async myReports() {
    const r = await this.context.tx.execute<{
      report_id: string;
      subject: string;
      is_anonymous: boolean;
      created_at: string;
      last_message_at: string;
      unread: number;
    }>(sql`select * from my_reports()`);
    return {
      items: r.rows.map((x) => ({
        id: x.report_id,
        subject: x.subject,
        anonymous: x.is_anonymous,
        reporterName: null,
        createdAt: iso(x.created_at),
        lastMessageAt: iso(x.last_message_at),
        unread: x.unread,
      })),
    };
  }

  async reportThread(p: HrmsPrincipal, id: string) {
    const tx = this.context.tx;
    if (p.role === 'ceo') {
      const head = await tx.execute<{
        subject: string;
        is_anonymous: boolean;
        reporter_name: string | null;
      }>(sql`
        select subject, is_anonymous, reporter_name from reports where id = ${id}::uuid and org_id = current_org_id()`);
      if (!head.rows[0]) throw new NotFoundException('Report not found.');
      const msgs = await tx.execute<{
        id: string;
        from_reporter: boolean;
        body: string;
        sent_at: string;
        read_at: string | null;
      }>(sql`
        select id::text as id, from_reporter, body, sent_at, read_at from report_messages
         where report_id = ${id}::uuid order by id`);
      return {
        id,
        subject: head.rows[0].subject,
        anonymous: head.rows[0].is_anonymous,
        reporterName: head.rows[0].reporter_name,
        asCeo: true,
        messages: msgs.rows.map((m) => ({
          id: m.id,
          mine: !m.from_reporter,
          body: m.body,
          sentAt: iso(m.sent_at),
          readAt: iso(m.read_at),
        })),
      };
    }
    const mine = await tx.execute<{ subject: string; is_anonymous: boolean }>(sql`
      select subject, is_anonymous from my_reports() where report_id = ${id}::uuid`);
    if (!mine.rows[0]) throw new NotFoundException('Report not found.');
    const msgs = await tx.execute<{
      id: string;
      from_reporter: boolean;
      body: string;
      sent_at: string;
      read_at: string | null;
    }>(sql`
      select id::text as id, from_reporter, body, sent_at, read_at from my_report_thread(${id}::uuid)`);
    return {
      id,
      subject: mine.rows[0].subject,
      anonymous: mine.rows[0].is_anonymous,
      reporterName: null,
      asCeo: false,
      messages: msgs.rows.map((m) => ({
        id: m.id,
        mine: m.from_reporter,
        body: m.body,
        sentAt: iso(m.sent_at),
        readAt: iso(m.read_at),
      })),
    };
  }

  async replyToReport(p: HrmsPrincipal, id: string, body: string): Promise<void> {
    const fn = p.role === 'ceo' ? sql`report_reply_as_ceo` : sql`report_reply_as_reporter`;
    await this.context.tx.execute(sql`select ${fn}(${id}::uuid, ${body})`);
  }

  async markReportRead(id: string): Promise<void> {
    await this.context.tx.execute(sql`select report_mark_read(${id}::uuid)`);
  }

  // ---- gameMaster (no organisation: every call is a database function) -------
  async gmContacts(q?: string) {
    const r = await this.context.tx.execute<{
      org_id: string;
      org_name: string;
      user_id: string;
      full_name: string;
      role: string;
    }>(sql`select * from gm_message_contacts(${q?.trim() || null})`);
    return {
      items: r.rows.map((c) => ({
        orgId: c.org_id,
        orgName: c.org_name,
        userId: c.user_id,
        fullName: c.full_name,
        role: c.role,
      })),
    };
  }

  async gmThreads() {
    const r = await this.context.tx.execute<ThreadRow>(sql`select * from gm_message_threads()`);
    return { items: r.rows.map(toThread) };
  }

  async gmThread(id: string) {
    const threads = await this.context.tx.execute<ThreadRow>(sql`
      select * from gm_message_threads() where conversation_id = ${id}::uuid`);
    const t = threads.rows[0];
    if (!t) throw new NotFoundException('Conversation not found.');
    const msgs = await this.context.tx.execute<{
      id: string;
      mine: boolean;
      body: string;
      sent_at: string;
      read_at: string | null;
    }>(sql`
      select id::text as id, mine, body, sent_at, read_at from gm_message_thread(${id}::uuid)`);
    return {
      id,
      otherUserId: t.other_user,
      otherName: t.other_name,
      otherRole: t.other_role,
      orgName: t.org_name ?? null,
      closed: t.other_role === null,
      messages: msgs.rows.map((m) => ({
        id: m.id,
        mine: m.mine,
        body: m.body,
        sentAt: iso(m.sent_at),
        readAt: iso(m.read_at),
      })),
    };
  }

  async gmStart(dto: GmStartThreadDto) {
    const r = await this.context.tx.execute<{ id: string }>(sql`
      select gm_message_start(${dto.orgId}::uuid, ${dto.toUserId}::uuid, ${dto.body}) as id`);
    return { conversationId: r.rows[0].id };
  }

  async gmReply(id: string, body: string) {
    await this.context.tx.execute(sql`select gm_message_send(${id}::uuid, ${body})`);
    return { conversationId: id };
  }

  async gmMarkRead(id: string): Promise<void> {
    await this.context.tx.execute(sql`select gm_message_mark_read(${id}::uuid)`);
  }

  async gmUnread(): Promise<{ messages: number }> {
    const r = await this.context.tx.execute<{ n: number }>(sql`
      select coalesce(sum(unread), 0)::int as n from gm_message_threads()`);
    return { messages: r.rows[0].n };
  }
}
