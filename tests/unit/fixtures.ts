import postgres from "postgres";

/**
 * Small deterministic workspace used by resolver tests.
 * Timezone Asia/Dhaka (UTC+6), weekend Fri+Sat, office 10:00–18:00, late threshold 15 min,
 * unpaid lunch 13:00–14:00 → 420 window minutes per day.
 */
export async function seedFixture(sql: postgres.Sql) {
  const [ws] = await sql`insert into workspaces (name, slug, timezone, invite_code)
    values ('Fixture', ${"fx-" + crypto.randomUUID().slice(0, 8)}, 'Asia/Dhaka', ${crypto.randomUUID().slice(0, 8)}) returning id`;
  const wsId = ws!.id as string;
  await sql`insert into workspace_settings (workspace_id, office_start, office_end, late_threshold_min, weekend_days)
    values (${wsId}, '10:00', '18:00', 15, '{5,6}')`;
  await sql`insert into break_windows (workspace_id, name, start_time, end_time, paid) values (${wsId}, 'Lunch', '13:00', '14:00', false)`;

  const mk = async (name: string, role: string, joined: string) => {
    const uid = crypto.randomUUID();
    await sql`insert into users (id, name, email) values (${uid}, ${name}, ${uid + "@t.test"})`;
    const [m] = await sql`insert into memberships (workspace_id, user_id, role, status, joined_at, employee_code)
      values (${wsId}, ${uid}, ${role}, 'active', ${joined}, ${name}) returning id`;
    return m!.id as string;
  };
  const owner = await mk("Owner", "owner", "2024-01-01");
  const a = await mk("Alice", "employee", "2025-01-01");
  const b = await mk("Bob", "employee", "2025-03-05");

  // Mar 2025: Sun 2 … Sat 8. Holiday on Tue 4 (active) and Wed 5 (proposed → still a workday).
  await sql`insert into holidays (workspace_id, date, name, status) values
    (${wsId}, '2025-03-04', 'Active holiday', 'active'), (${wsId}, '2025-03-05', 'Proposed', 'proposed')`;

  const att = (member: string, date: string, status: string, inAt: string | null, outAt: string | null, lateMinutes = 0) =>
    sql`insert into attendance (workspace_id, membership_id, date, mode, status, check_in_at, check_out_at, break_minutes, late_minutes)
      values (${wsId}, ${member}, ${date}, 'office', ${status}, ${inAt}, ${outAt}, 60, ${lateMinutes})`;

  await att(a, "2025-03-02", "present", "2025-03-02T10:00:00+06:00", "2025-03-02T18:00:00+06:00"); // 420
  await att(a, "2025-03-03", "late", "2025-03-03T10:30:00+06:00", "2025-03-03T18:00:00+06:00", 30); // 390
  await att(a, "2025-03-05", "half_day", "2025-03-05T10:00:00+06:00", "2025-03-05T15:00:00+06:00"); // 240
  await att(a, "2025-03-06", "present", "2025-03-06T10:00:00+06:00", null); // missing checkout
  await sql`insert into leave_requests (workspace_id, membership_id, kind, half, start_date, end_date, days, reason, status)
    values (${wsId}, ${a}, 'half_day', 'second', '2025-03-05', '2025-03-05', 0.5, 'Doctor', 'approved'),
           (${wsId}, ${b}, 'full_day', null, '2025-03-20', '2025-03-21', 2, 'Trip', 'pending')`;

  return { wsId, owner, a, b };
}
