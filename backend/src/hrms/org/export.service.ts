import { GoneException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsContextService } from '../db/hrms-context';

// Every table that holds the org's own data. project_ratings is left out on purpose: the
// app cannot read it (ratings are anonymous). Secrets live on users, which is not exported.
const TABLES = [
  'org_settings',
  'org_office_networks',
  'org_holidays',
  'subscriptions',
  'org_members',
  'projects',
  'project_members',
  'project_completion_ticks',
  'tasks',
  'task_assignees',
  'task_status_history',
  'requests',
  'project_invites',
  'meetings',
  'meeting_invitees',
  'leave_types',
  'leave_requests',
  'attendance_days',
  'attendance_corrections',
  'performance_scores',
  'notifications',
  'audit_log',
  'audit_notes',
] as const;

@Injectable()
export class ExportService {
  constructor(private readonly context: HrmsContextService) {}

  async export(p: HrmsPrincipal) {
    const tx = this.context.tx;
    const org = await tx.execute<Record<string, unknown>>(sql`
      select id, name, plan_code, status::text as status, suspended_at, purge_after, created_at,
             (purge_after is not null and purge_after < now()) as purged
        from orgs where id = current_org_id()`);
    const { purged, ...o } = org.rows[0] ?? {};
    if (purged === true) {
      throw new GoneException('The retention period has ended and this organisation\'s data is no longer available.');
    }

    const people = await tx.execute(sql`
      select m.id as member_id, u.full_name, u.email::text as email, m.role::text as role, m.status::text as status
        from org_members m join users u on u.id = m.user_id where m.org_id = current_org_id() order by u.full_name`);

    const data: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows = await tx.execute<{ rows: unknown[] }>(
        sql`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows
              from ${sql.identifier(table)} t where t.org_id = current_org_id()`,
      );
      data[table] = rows.rows[0].rows;
    }

    // Leaving a trace: the export itself is part of the history.
    await tx.execute(sql`
      insert into audit_log (org_id, actor_user_id, actor_member_id, action, table_name, row_id)
      values (current_org_id(), ${p.userId}, ${p.memberId}, 'EXPORT', 'orgs', current_org_id()::text)`);

    return {
      exportedAt: new Date().toISOString(),
      organisation: o,
      people: people.rows,
      tables: data,
    };
  }
}
