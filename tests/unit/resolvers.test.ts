import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { inject } from "vitest";
import { seedFixture } from "./fixtures";

const sql = postgres(inject("databaseUrl"), { max: 1, onnotice: () => {} });
let fx: Awaited<ReturnType<typeof seedFixture>>;

beforeAll(async () => {
  fx = await seedFixture(sql);
  // Pin "now": Mon 10 Mar 2025 12:00 in Dhaka (before office end).
  await sql`select set_config('app.now', '2025-03-10T12:00:00+06:00', false)`;
});
afterAll(() => sql.end());

const num = (v: unknown) => Number(v);

describe("fn_expected_workdays", () => {
  it("excludes weekends and active holidays but not proposed ones", async () => {
    const [r] = await sql`select fn_expected_workdays(${fx.wsId}, '2025-03-02', '2025-03-08') as n`;
    // Sun 2, Mon 3, (Tue 4 holiday), Wed 5 (proposed only), Thu 6; Fri/Sat weekend
    expect(r!.n).toBe(4);
  });
  it("returns 0 for an inverted range", async () => {
    const [r] = await sql`select fn_expected_workdays(${fx.wsId}, '2025-03-08', '2025-03-02') as n`;
    expect(r!.n).toBe(0);
  });
});

describe("fn_window_minutes / fn_expected_minutes", () => {
  it("subtracts unpaid breaks from the office window", async () => {
    const [r] = await sql`select fn_window_minutes(${fx.wsId}) as n`;
    expect(r!.n).toBe(420);
  });
  it("counts approved half-day leave as half a day", async () => {
    const [r] = await sql`select fn_expected_minutes(${fx.wsId}, ${fx.a}, '2025-03-02', '2025-03-08') as n`;
    expect(num(r!.n)).toBe(3.5 * 420);
  });
  it("starts counting from the joining date", async () => {
    const [r] = await sql`select fn_expected_minutes(${fx.wsId}, ${fx.b}, '2025-03-02', '2025-03-08') as n`;
    expect(num(r!.n)).toBe(2 * 420); // Wed 5, Thu 6
  });
});

describe("timezones", () => {
  it("derives local today and the effective end from the workspace timezone", async () => {
    // 20:00 UTC on Mar 10 is 02:00 Mar 11 in Dhaka, before office end → effective end is Mar 10.
    const [r] = await sql`select fn_local_today(${fx.wsId}) as today, fn_effective_end(${fx.wsId}, '2025-03-31') as eff
      from (select set_config('app.now', '2025-03-10T20:00:00Z', true)) x`;
    expect(r!.today.toISOString().slice(0, 10)).toBe("2025-03-11");
    expect(r!.eff.toISOString().slice(0, 10)).toBe("2025-03-10");
  });
  it("includes today once office end has passed", async () => {
    const [r] = await sql`select fn_effective_end(${fx.wsId}, '2025-03-31') as eff
      from (select set_config('app.now', '2025-03-10T18:30:00+06:00', true)) x`;
    expect(r!.eff.toISOString().slice(0, 10)).toBe("2025-03-10");
  });
});

describe("fn_attendance_summary", () => {
  it("counts present, late, half-days, absences and missing checkouts", async () => {
    const rows = await sql`select * from fn_attendance_summary(${fx.wsId}, '2025-03-02', '2025-03-08')`;
    expect(rows.find((r) => r.membership_id === fx.owner)).toBeUndefined(); // owners are not tracked
    const a = rows.find((r) => r.membership_id === fx.a)!;
    expect(a).toMatchObject({ expected_days: 4, present_days: 4, late_days: 1, half_days: 1, absent_days: 0, missing_checkout: 1 });
    expect(num(a.tracked_minutes)).toBe(420 + 390 + 240);
    const b = rows.find((r) => r.membership_id === fx.b)!;
    expect(b).toMatchObject({ expected_days: 2, present_days: 0, absent_days: 2 });
  });
});

describe("fn_performance_index", () => {
  it("applies penalty points and productivity ratio", async () => {
    const rows = await sql`select * from fn_performance_index(${fx.wsId}, '2025-03-02', '2025-03-08')`;
    const a = rows.find((r) => r.membership_id === fx.a)!;
    // penalties: late 2 + missing checkout 1 + half-day 1 = 4
    expect(num(a.attendance_index)).toBe(96);
    expect(num(a.productivity_index)).toBe(71.4); // 1050 / 1470
    expect(num(a.performance_index)).toBe(83.7);
    expect(num(a.worked_hours)).toBe(17.5);
    expect(num(a.expected_hours)).toBe(24.5);
    const b = rows.find((r) => r.membership_id === fx.b)!;
    expect(num(b.attendance_index)).toBe(90); // 2 absences × 5
    expect(num(b.productivity_index)).toBe(0);
    expect(num(b.performance_index)).toBe(45);
  });
  it("respects custom scoring rules and the late threshold data", async () => {
    await sql`update workspace_settings set scoring = '{"late":10,"absent":0,"missingCheckout":0,"halfDay":0}' where workspace_id = ${fx.wsId}`;
    const rows = await sql`select * from fn_performance_index(${fx.wsId}, '2025-03-02', '2025-03-08')`;
    expect(num(rows.find((r) => r.membership_id === fx.a)!.attendance_index)).toBe(90);
    await sql`update workspace_settings set scoring = '{"late":2,"absent":5,"missingCheckout":1,"halfDay":1}' where workspace_id = ${fx.wsId}`;
  });
});

describe("fn_daily_report", () => {
  it("summarises one workday", async () => {
    const [r] = await sql`select fn_daily_report(${fx.wsId}, '2025-03-03') as d`;
    const d = r!.d;
    expect(d.isWorkday).toBe(true);
    expect(d.attendance).toMatchObject({ expected: 1, present: 1, late: 1, remote: 0, absent: 0 }); // Bob joined Mar 5
    expect(d.operational.workedMinutes).toBe(390);
  });
  it("treats holidays as non-working days", async () => {
    const [r] = await sql`select fn_daily_report(${fx.wsId}, '2025-03-04') as d`;
    expect(r!.d.isWorkday).toBe(false);
    expect(r!.d.attendance.expected).toBe(0);
    expect(r!.d.operational.isHoliday).toBe(true);
  });
  it("reports absent members and missing checkouts", async () => {
    const [r] = await sql`select fn_daily_report(${fx.wsId}, '2025-03-06') as d`;
    expect(r!.d.attendance).toMatchObject({ expected: 2, present: 1, absent: 1 });
    expect(r!.d.operational.missingCheckout).toBe(1);
  });
});

describe("v_inbox_items", () => {
  it("lists decisions, exceptions and the proposed holiday", async () => {
    const rows = await sql`select kind, tab from v_inbox_items where workspace_id = ${fx.wsId}`;
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("leave");
    expect(kinds).toContain("holiday_add");
    expect(kinds).toContain("missing_checkout");
    expect(rows.filter((r) => r.kind === "absent").length).toBeGreaterThan(0);
  });
});

describe("row level security", () => {
  it("hides other workspaces from the app role", async () => {
    const other = crypto.randomUUID();
    const res = await sql.begin(async (tx) => {
      await tx`select set_config('app.workspace_id', ${other}, true)`;
      await tx`set local role ledger_app`;
      return tx`select count(*)::int as n from attendance`;
    });
    expect(res[0]!.n).toBe(0);
    const own = await sql.begin(async (tx) => {
      await tx`select set_config('app.workspace_id', ${fx.wsId}, true)`;
      await tx`set local role ledger_app`;
      return tx`select count(*)::int as n from attendance`;
    });
    expect(own[0]!.n).toBe(4);
  });
});
