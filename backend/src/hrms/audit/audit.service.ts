import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';
import { iso } from '../hrms-rows';
import type { ListAuditQueryDto } from './dto/audit.dto';

interface AuditRow extends Record<string, unknown> {
  id: string;
  action: string;
  table_name: string;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_member_id: string | null;
  actor_name: string | null;
  notes: Array<{ id: string; note: string; authorName: string; createdAt: string }>;
}

// Whatever the database already left out (password_hash, mfa_secret_enc, reset tokens) stays
// out. These are removed as well, in case a future column carries a secret.
const SECRET_KEYS = ['password_hash', 'mfa_secret_enc', 'reset_token_hash', 'token_hash'];

function clean(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const copy = { ...data };
  for (const key of SECRET_KEYS) delete copy[key];
  return copy;
}

@Injectable()
export class AuditService {
  constructor(private readonly context: HrmsContextService) {}

  async list(q: ListAuditQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const where: SQL[] = [sql`a.org_id = current_org_id()`];
    if (q.table) {
      const tables = q.table.split(',').map((t) => sql`${t}`);
      where.push(sql`a.table_name in (${sql.join(tables, sql`, `)})`);
    }
    // Sign-in stamps and bare touches carry no information for a reader.
    where.push(sql`not (a.action = 'UPDATE'
      and (a.new_data - 'updated_at' - 'last_login_at') = (a.old_data - 'updated_at' - 'last_login_at'))`);
    if (q.memberId) where.push(sql`a.actor_member_id = ${q.memberId}`);
    if (q.action) where.push(sql`a.action = ${q.action.toUpperCase()}`);
    if (q.from) where.push(sql`a.created_at >= ${q.from}::timestamptz`);
    if (q.to) where.push(sql`a.created_at < ${q.to}::timestamptz`);
    const cond = sql.join(where, sql` and `);

    const tx = this.context.tx;
    const total = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from audit_log a where ${cond}`,
    );
    const rows = await tx.execute<AuditRow>(sql`
      select a.id::text as id, a.action, a.table_name, a.row_id, a.old_data, a.new_data, a.created_at,
             a.actor_member_id, u.full_name as actor_name,
             coalesce((select json_agg(json_build_object('id', n.id, 'note', n.note,
                                                         'authorName', nu.full_name, 'createdAt', n.created_at)
                                       order by n.created_at)
                         from audit_notes n
                         join org_members nm on nm.id = n.author_id
                         join users nu on nu.id = nm.user_id
                        where n.audit_id = a.id), '[]'::json) as notes
        from audit_log a
        left join org_members m on m.id = a.actor_member_id
        left join users u on u.id = m.user_id
       where ${cond}
       order by a.id desc limit ${pageSize} offset ${(page - 1) * pageSize}`);

    const names = await this.resolveNames(rows.rows);
    return {
      names,
      items: rows.rows.map((r) => ({
        id: r.id,
        action: r.action,
        table: r.table_name,
        rowId: r.row_id,
        before: clean(r.old_data),
        after: clean(r.new_data),
        at: iso(r.created_at),
        actor: r.actor_member_id ? { id: r.actor_member_id, fullName: r.actor_name } : null,
        notes: r.notes.map((n) => ({ ...n, id: String(n.id), createdAt: iso(n.createdAt) })),
      })),
      total: total.rows[0].n,
      page,
      pageSize,
    };
  }

  /** Names for the ids an entry mentions, so the page can say "Sara" instead of a uuid. */
  private async resolveNames(rows: AuditRow[]): Promise<Record<string, string>> {
    const ids = new Set<string>();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const r of rows) {
      for (const data of [r.old_data, r.new_data]) {
        for (const [k, v] of Object.entries(data ?? {})) {
          if (typeof v === 'string' && uuid.test(v) && k !== 'id' && k !== 'org_id') ids.add(v);
        }
      }
      if (r.row_id && uuid.test(r.row_id)) ids.add(r.row_id);
    }
    if (ids.size === 0) return {};
    const list = sql.join(
      [...ids].map((i) => sql`${i}`),
      sql`, `,
    );
    const tx = this.context.tx;
    const [members, projects, tasks] = await Promise.all([
      tx.execute<{ id: string; name: string }>(sql`
        select m.id::text as id, u.full_name as name from org_members m join users u on u.id = m.user_id
         where m.id::text in (${list})`),
      tx.execute<{ id: string; name: string }>(
        sql`select id::text as id, name from projects where id::text in (${list})`,
      ),
      tx.execute<{ id: string; name: string }>(
        sql`select id::text as id, title as name from tasks where id::text in (${list})`,
      ),
    ]);
    const out: Record<string, string> = {};
    for (const r of [...members.rows, ...projects.rows, ...tasks.rows]) out[r.id] = r.name;
    return out;
  }

  /** The entry itself is never changed: the CEO's note is a separate row beside it. */
  async addNote(p: HrmsPrincipal, auditId: string, note: string) {
    if (!/^\d{1,18}$/.test(auditId)) throw new BadRequestException('Invalid history entry.');
    const text = note.trim();
    if (text.length === 0) throw new BadRequestException('A note cannot be empty.');
    const entry = await this.context.tx.execute(
      sql`select 1 from audit_log where id = ${auditId}::bigint and org_id = current_org_id()`,
    );
    if (entry.rows.length === 0) throw new NotFoundException('History entry not found.');
    const created = await this.context.tx.execute<{ id: string; created_at: string }>(sql`
      insert into audit_notes (audit_id, org_id, author_id, note)
      values (${auditId}::bigint, current_org_id(), ${p.memberId}, ${text})
      returning id::text as id, created_at`);
    return { id: created.rows[0].id, note: text, createdAt: iso(created.rows[0].created_at) };
  }
}
