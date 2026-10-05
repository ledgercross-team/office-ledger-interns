import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { withWorkspace } from "@/db";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";
import { localDate } from "@/lib/dates";

export const prerender = false;

/** Tenant tables included in the export; secret columns are dropped. */
const TABLES: Record<string, string[]> = {
  workspaces: ["invite_code"],
  workspace_settings: [],
  departments: [],
  designations: [],
  memberships: ["ical_token"],
  break_windows: [],
  attendance: [],
  attendance_breaks: [],
  attendance_corrections: [],
  exception_acks: [],
  leave_types: [],
  leave_balances: [],
  leave_requests: [],
  holidays: [],
  meetings: [],
  meeting_attendees: [],
  tasks: [],
  task_assignees: [],
  task_comments: [],
  task_checklist_items: [],
  complaints: [],
  complaint_events: [],
  announcements: [],
  notifications: [],
  daily_report_snapshots: [],
  daily_report_corrections: [],
  audit_log: [],
  files: ["storage_key"],
  invites: ["token"],
};

/** Danger zone → "Export all workspace data": a ZIP with one CSV per table (owner only). */
export const GET: APIRoute = async ({ locals }) => {
  const ctx = locals.ctx;
  if (!ctx || !can(ctx, "workspace.delete")) return new Response("Forbidden", { status: 403 });
  const files: Record<string, Uint8Array> = {};
  await withWorkspace(ctx.workspaceId, async (tx) => {
    for (const [table, hidden] of Object.entries(TABLES)) {
      const rows = await tx.execute<Record<string, unknown>>(sql.raw(`select * from "${table}"`));
      const cols = rows.length ? Object.keys(rows[0]!).filter((c) => !hidden.includes(c)) : [];
      files[`${table}.csv`] = strToU8(
        "﻿" +
          toCsv(
            cols,
            rows.map((r) =>
              cols.map((c) =>
                typeof r[c] === "object" && r[c] !== null && !(r[c] instanceof Date)
                  ? JSON.stringify(r[c])
                  : r[c],
              ),
            ),
          ),
      );
    }
    // Users are global; export only the names/emails of this workspace's members.
    const people = await tx.execute<Record<string, unknown>>(
      sql`select u.id, u.name, u.email, u.created_at from users u join memberships m on m.user_id = u.id where m.workspace_id = ${ctx.workspaceId}`,
    );
    files["users.csv"] = strToU8(
      "﻿" +
        toCsv(
          ["id", "name", "email", "created_at"],
          people.map((p) => [p.id, p.name, p.email, p.created_at]),
        ),
    );
    await audit(tx, ctx, "workspace.exported", "workspace", ctx.workspaceId, "Exported all workspace data");
  });
  files["README.txt"] = strToU8(
    `Office Ledger export for ${ctx.workspaceName}\nGenerated ${new Date().toISOString()}\nOne CSV per table. Timestamps are UTC; dates are local to ${ctx.timezone}.\n`,
  );
  const zip = zipSync(files, { level: 6 });
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ctx.workspaceSlug}-export-${localDate(ctx.timezone)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
};
