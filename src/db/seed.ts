/**
 * Demo data: workspace "Ledgercross" with an Owner, 2 Managers, 12 Employees across Software /
 * Design / Operations, 90 days of attendance and enough records for every screen.
 * Re-runnable: removes the previous demo workspace and demo users first.
 */
import { randomBytes } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { db, client } from "./index";
import * as s from "./schema";
import { hashPassword } from "@/lib/password";
import { addDaysISO, localDate, localTime, minutesOf, weekday, zoned, type ISODate } from "@/lib/dates";

const TZ = "Asia/Dhaka";
const PASSWORD = "Ledger#2026";
const DOMAIN = "ledgercross.test";

// Deterministic PRNG so every seed produces the same story.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const id = () => randomBytes(16).toString("hex");

const people = [
  { name: "Nadia Rahman", email: "owner", role: "owner", dept: "Operations", desig: "Managing Director" },
  { name: "Tanvir Hossain", email: "manager", role: "manager", dept: "Software", desig: "Engineering Manager" },
  { name: "Farzana Akter", email: "manager2", role: "manager", dept: "Operations", desig: "Operations Manager" },
  { name: "Arif Chowdhury", email: "employee", role: "employee", dept: "Software", desig: "Senior Software Engineer" },
  { name: "Sadia Islam", email: "sadia", role: "employee", dept: "Software", desig: "Software Engineer" },
  { name: "Rakib Hasan", email: "rakib", role: "employee", dept: "Software", desig: "Software Engineer" },
  { name: "Mehnaz Karim", email: "mehnaz", role: "employee", dept: "Software", desig: "QA Engineer" },
  { name: "Imran Kabir", email: "imran", role: "employee", dept: "Software", desig: "Software Engineer" },
  { name: "Lamia Sultana", email: "lamia", role: "employee", dept: "Design", desig: "Product Designer" },
  { name: "Shuvo Das", email: "shuvo", role: "employee", dept: "Design", desig: "UX Researcher" },
  { name: "Nusrat Jahan", email: "nusrat", role: "employee", dept: "Design", desig: "Product Designer" },
  { name: "Kamal Uddin", email: "kamal", role: "employee", dept: "Operations", desig: "Operations Executive" },
  { name: "Ayesha Siddiqua", email: "ayesha", role: "employee", dept: "Operations", desig: "HR Officer" },
  { name: "Zahid Alam", email: "zahid", role: "employee", dept: "Operations", desig: "Accounts Officer" },
  { name: "Priya Saha", email: "priya", role: "employee", dept: "Design", desig: "Graphic Designer" },
] as const;
const extra = [
  { name: "Habib Rahman", email: "pending", status: "pending" },
  { name: "Mitu Begum", email: "rejected", status: "rejected" },
  { name: "Sohel Rana", email: "former", status: "deactivated" },
] as const;

async function main() {
  console.log("Seeding Ledgercross…");
  const old = await db.select({ id: s.workspaces.id }).from(s.workspaces).where(eq(s.workspaces.slug, "ledgercross"));
  if (old.length) await db.delete(s.workspaces).where(inArray(s.workspaces.id, old.map((o) => o.id)));
  await db.delete(s.users).where(like(s.users.email, `%@${DOMAIN}`));

  const now = new Date();
  const today = localDate(TZ, now);
  const nowMin = minutesOf(localTime(TZ, now));

  const [ws] = await db
    .insert(s.workspaces)
    .values({
      name: "Ledgercross",
      slug: "ledgercross",
      timezone: TZ,
      country: "BD",
      locale: "en-US",
      inviteCode: "LEDGER-7Q4K",
      onboardedAt: now,
    })
    .returning();
  const wsId = ws!.id;
  await db.insert(s.workspaceSettings).values({
    workspaceId: wsId,
    officeStart: "10:00:00",
    officeEnd: "18:00:00",
    lateThresholdMin: 15,
    remoteDaysPerWeek: 2,
    approvalMode: "both",
    weekendDays: [5, 6],
    autoCheckoutAt: "23:00:00",
  });
  await db.insert(s.breakWindows).values([
    { workspaceId: wsId, name: "Lunch", startTime: "13:00:00", endTime: "14:00:00", paid: false },
    { workspaceId: wsId, name: "Tea", startTime: "16:30:00", endTime: "16:45:00", paid: true },
  ]);

  const depts = await db
    .insert(s.departments)
    .values(["Software", "Design", "Operations"].map((name) => ({ workspaceId: wsId, name })))
    .returning();
  const deptId = (n: string) => depts.find((d) => d.name === n)!.id;
  const desigNames = [...new Set(people.map((p) => p.desig))];
  const desigs = await db
    .insert(s.designations)
    .values(desigNames.map((name) => ({ workspaceId: wsId, name })))
    .returning();
  const desigId = (n: string) => desigs.find((d) => d.name === n)!.id;

  const leaveTypes = await db
    .insert(s.leaveTypes)
    .values([
      { workspaceId: wsId, code: "casual", name: "Casual", yearlyQuota: 10, accrual: "monthly", color: "info" },
      { workspaceId: wsId, code: "sick", name: "Sick", yearlyQuota: 14, accrual: "yearly", color: "danger" },
      { workspaceId: wsId, code: "annual", name: "Annual", yearlyQuota: 18, accrual: "monthly", color: "success" },
      { workspaceId: wsId, code: "unpaid", name: "Unpaid", yearlyQuota: 0, paid: false, color: "warning" },
    ])
    .returning();
  const lt = (code: string) => leaveTypes.find((l) => l.code === code)!.id;

  // Users + credential accounts + memberships
  const pw = await hashPassword(PASSWORD);
  const members: { id: string; userId: string; name: string; role: string; dept: string }[] = [];
  let n = 1;
  for (const p of [...people, ...extra]) {
    const userId = id();
    const email = `${p.email}@${DOMAIN}`;
    await db.insert(s.users).values({ id: userId, name: p.name, email, emailVerified: true, activeWorkspaceId: wsId });
    await db.insert(s.accounts).values({ id: id(), accountId: userId, providerId: "credential", userId, password: pw });
    const role = "role" in p ? p.role : "employee";
    const status = "status" in p ? p.status : "active";
    const dept = "dept" in p ? p.dept : pick(["Software", "Design", "Operations"]);
    const joined = role === "owner" ? addDaysISO(today, -900) : addDaysISO(today, -(120 + Math.floor(rand() * 600)));
    const [m] = await db
      .insert(s.memberships)
      .values({
        workspaceId: wsId,
        userId,
        employeeCode: status === "pending" ? null : `LC-${String(n++).padStart(3, "0")}`,
        role: role as "owner" | "manager" | "employee",
        status: status as "active",
        departmentId: deptId(dept),
        designationId: "desig" in p ? desigId(p.desig) : null,
        joinedAt: status === "pending" ? null : joined,
        birthDate: `19${90 + Math.floor(rand() * 9)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 27)).padStart(2, "0")}`,
        phone: `+8801${Math.floor(300000000 + rand() * 600000000)}`,
        address: pick(["Gulshan 2, Dhaka", "Dhanmondi 27, Dhaka", "Mirpur DOHS, Dhaka", "Uttara Sector 7, Dhaka", "Banani, Dhaka"]),
        bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-"]),
        emergencyContact: { name: "Family contact", phone: "+8801700000000", relation: pick(["Spouse", "Parent", "Sibling"]) },
        icalToken: id(),
        statusChangedAt: now,
      })
      .returning();
    members.push({ id: m!.id, userId, name: p.name, role, dept });
  }
  const active = members.slice(0, people.length);
  const owner = active[0]!;
  const managers = active.filter((m) => m.role === "manager");
  const tracked = active.filter((m) => m.role !== "owner");
  // Reporting lines: Software → Tanvir, everyone else → Farzana; managers → owner.
  for (const m of active.slice(1)) {
    const mgr = m.role === "manager" ? owner : m.dept === "Software" ? managers[0]! : managers[1]!;
    await db.update(s.memberships).set({ managerId: mgr.id }).where(eq(s.memberships.id, m.id));
  }

  // A joining date for one employee becomes a work anniversary this week.
  await db
    .update(s.memberships)
    .set({ joinedAt: addDaysISO(today, -365 + 2) })
    .where(eq(s.memberships.id, tracked[5]!.id));

  // Holidays: one past, one upcoming, one manager proposal.
  const isWeekend = (d: ISODate) => [5, 6].includes(weekday(d));
  const nextWorkday = (d: ISODate) => {
    while (isWeekend(d)) d = addDaysISO(d, 1);
    return d;
  };
  const pastHoliday = nextWorkday(addDaysISO(today, -30));
  const upcomingHoliday = nextWorkday(addDaysISO(today, 12));
  await db.insert(s.holidays).values([
    { workspaceId: wsId, date: pastHoliday, name: "Founders' Day", status: "active", proposedBy: owner.id, approvedBy: owner.id },
    { workspaceId: wsId, date: upcomingHoliday, name: "Company Retreat", status: "active", proposedBy: owner.id, approvedBy: owner.id },
    { workspaceId: wsId, date: nextWorkday(addDaysISO(today, 25)), name: "Team Offsite", status: "proposed", proposedBy: managers[1]!.id },
  ]);

  // Leave requests in every state. Approved ones become "on_leave" attendance rows.
  const leaveRows: (typeof s.leaveRequests.$inferInsert)[] = [];
  const leaveDays = new Map<string, "full" | "half">();
  const addLeave = (m: (typeof tracked)[number], code: string, start: ISODate, len: number, status: "pending" | "approved" | "rejected" | "cancelled", reason: string, half?: "first" | "second") => {
    start = nextWorkday(start);
    const days: ISODate[] = [];
    let d = start;
    while (days.length < len) {
      if (!isWeekend(d) && d !== pastHoliday) days.push(d);
      d = addDaysISO(d, 1);
    }
    const reviewed = status === "approved" || status === "rejected";
    leaveRows.push({
      workspaceId: wsId,
      membershipId: m.id,
      leaveTypeId: lt(code),
      kind: half ? "half_day" : "full_day",
      half: half ?? null,
      startDate: start,
      endDate: days.at(-1)!,
      days: half ? 0.5 : len,
      reason,
      status,
      reviewerId: reviewed ? managers[0]!.id : null,
      reviewedAt: reviewed ? new Date(zoned(TZ, addDaysISO(start, -2), "11:00")) : null,
      reviewNote: status === "rejected" ? "Overlaps with the release week. Please pick other dates." : null,
      createdAt: new Date(zoned(TZ, addDaysISO(start, -5), "09:30")),
    });
    if (status === "approved") for (const day of days) leaveDays.set(`${m.id}:${day}`, half ? "half" : "full");
  };
  addLeave(tracked[2]!, "annual", addDaysISO(today, -40), 3, "approved", "Family wedding in Chattogram");
  addLeave(tracked[4]!, "sick", addDaysISO(today, -12), 2, "approved", "Fever and doctor's advice to rest");
  addLeave(tracked[6]!, "casual", addDaysISO(today, -20), 1, "approved", "Personal errand", "second");
  addLeave(tracked[7]!, "casual", addDaysISO(today, -8), 1, "rejected", "Short trip");
  addLeave(tracked[8]!, "annual", addDaysISO(today, 6), 4, "pending", "Visiting parents in Sylhet");
  addLeave(tracked[3]!, "casual", addDaysISO(today, 2), 1, "pending", "Bank appointment", "first");
  addLeave(tracked[9]!, "sick", addDaysISO(today, 1), 1, "pending", "Dental surgery");
  addLeave(tracked[10]!, "annual", addDaysISO(today, 30), 2, "cancelled", "Plans changed");
  addLeave(tracked[11]!, "unpaid", addDaysISO(today, -60), 2, "approved", "Extended family emergency");
  // someone is out today
  if (!isWeekend(today)) addLeave(tracked[1]!, "casual", today, 1, "approved", "Moving house");
  await db.insert(s.leaveRequests).values(leaveRows);

  // 90 days of attendance.
  const window = { start: 10 * 60, end: 18 * 60 };
  const att: (typeof s.attendance.$inferInsert)[] = [];
  for (let back = 90; back >= 0; back--) {
    const day = addDaysISO(today, -back);
    if (isWeekend(day) || day === pastHoliday) continue;
    const isToday = back === 0;
    for (const m of tracked) {
      const leave = leaveDays.get(`${m.id}:${day}`);
      if (leave === "full") {
        att.push({ workspaceId: wsId, membershipId: m.id, date: day, status: "on_leave", source: "leave" });
        continue;
      }
      const r = rand();
      if (!leave && r < 0.04) continue; // absent without leave
      const remote = rand() < 0.14;
      const late = rand() < 0.12;
      const lateMin = late ? 16 + Math.floor(rand() * 50) : 0;
      const inMin = late ? window.start + lateMin : window.start - 20 + Math.floor(rand() * 34);
      if (isToday && inMin > nowMin) continue; // hasn't arrived yet
      const half = leave === "half" || (!leave && rand() < 0.02);
      let outMin: number | null = half ? window.start + 4 * 60 + Math.floor(rand() * 40) : window.end - 10 + Math.floor(rand() * 70);
      const missing = !isToday && !half && rand() < 0.025;
      if (isToday && outMin > nowMin) outMin = null;
      const status = half ? "half_day" : late ? "late" : remote ? "remote" : "present";
      // Recent late/remote check-ins (last 2 days) still await approval; a few were rejected.
      const needsApproval = !half && (late || remote);
      const approval = !needsApproval ? "not_required" : back <= 1 ? "pending" : rand() < 0.04 ? "rejected" : "approved";
      att.push({
        workspaceId: wsId,
        membershipId: m.id,
        date: day,
        mode: remote ? "remote" : "office",
        status,
        lateMinutes: late ? lateMin - 0 : 0,
        checkInAt: zoned(TZ, day, `${String(Math.floor(inMin / 60)).padStart(2, "0")}:${String(inMin % 60).padStart(2, "0")}`),
        checkOutAt:
          missing || outMin == null
            ? missing && back > 0
              ? zoned(TZ, day, "18:00")
              : null
            : zoned(TZ, day, `${String(Math.floor(outMin / 60)).padStart(2, "0")}:${String(outMin % 60).padStart(2, "0")}`),
        autoCheckedOut: missing && back > 0,
        breakMinutes: half || (isToday && outMin == null) ? 0 : 60,
        approval,
        reviewedBy: approval === "approved" || approval === "rejected" ? managers[0]!.id : null,
        note: remote ? pick(["Working from home", "Internet technician visit", "Client calls from home"]) : null,
        source: "seed",
      });
    }
  }
  for (let i = 0; i < att.length; i += 500) await db.insert(s.attendance).values(att.slice(i, i + 500));

  // Owner checked in today too (not tracked in metrics).
  if (!isWeekend(today) && nowMin > window.start) {
    await db.insert(s.attendance).values({
      workspaceId: wsId,
      membershipId: owner.id,
      date: today,
      mode: "office",
      status: "present",
      checkInAt: zoned(TZ, today, "09:40"),
      source: "seed",
    });
  }

  // Attendance correction requests: one pending, one approved (shown as a correction on its report).
  const lastWorkday = (() => {
    let d = addDaysISO(today, -1);
    while (isWeekend(d) || d === pastHoliday) d = addDaysISO(d, -1);
    return d;
  })();
  await db.insert(s.attendanceCorrections).values([
    {
      workspaceId: wsId,
      membershipId: tracked[3]!.id,
      date: lastWorkday,
      requestedCheckOut: zoned(TZ, lastWorkday, "18:20"),
      reason: "Forgot to check out after the client call ran late.",
      status: "pending",
    },
  ]);
  await db.insert(s.dailyReportCorrections).values({
    workspaceId: wsId,
    date: addDaysISO(lastWorkday, -7),
    kind: "attendance_correction",
    description: `${tracked[5]!.name}: check-out corrected to 18:05 (approved by ${managers[0]!.name})`,
    createdBy: managers[0]!.id,
  });

  // Tasks
  const taskSpecs = [
    { title: "Ship payroll export v2", status: "in_progress", priority: "high", dept: "Software", who: [3, 4], due: 3, labels: ["release"] },
    { title: "Fix timezone bug in leave calendar", status: "blocked", priority: "urgent", dept: "Software", who: [5], due: 1, labels: ["bug"] },
    { title: "Design onboarding checklist screens", status: "todo", priority: "medium", dept: "Design", who: [8, 10], due: 7, labels: ["design"] },
    { title: "Quarterly vendor contract review", status: "todo", priority: "high", dept: "Operations", who: [11], due: 5, labels: ["finance"] },
    { title: "Usability study: mobile check-in", status: "in_progress", priority: "medium", dept: "Design", who: [9], due: 10, labels: ["research"] },
    { title: "Renew office internet contract", status: "done", priority: "low", dept: "Operations", who: [12], due: -3, labels: [] },
    { title: "Prepare security audit evidence", status: "todo", priority: "urgent", dept: "Software", who: [6, 7], due: 2, labels: ["security"] },
    { title: "Update employee handbook", status: "in_progress", priority: "low", dept: "Operations", who: [12], due: 14, labels: ["hr"] },
    { title: "Old landing page experiment", status: "done", priority: "low", dept: "Design", who: [13], due: -40, labels: [], archived: true },
  ] as const;
  let pos = 1;
  for (const t of taskSpecs) {
    const [task] = await db
      .insert(s.tasks)
      .values({
        workspaceId: wsId,
        title: t.title,
        description: `**Goal:** ${t.title.toLowerCase()}.\n\n- Agree scope with the team\n- Track progress on this card`,
        status: t.status,
        priority: t.priority,
        dueDate: addDaysISO(today, t.due),
        labels: [...t.labels],
        departmentId: deptId(t.dept),
        position: pos++,
        createdBy: managers[0]!.id,
        completedAt: t.status === "done" ? now : null,
        archivedAt: "archived" in t ? now : null,
      })
      .returning();
    await db.insert(s.taskAssignees).values(t.who.map((i) => ({ workspaceId: wsId, taskId: task!.id, membershipId: active[i]!.id })));
    await db.insert(s.taskChecklistItems).values([
      { workspaceId: wsId, taskId: task!.id, text: "Kick-off", done: true, position: 1 },
      { workspaceId: wsId, taskId: task!.id, text: "First draft", done: t.status === "done", position: 2 },
    ]);
    if (t.status === "blocked")
      await db.insert(s.taskComments).values({
        workspaceId: wsId,
        taskId: task!.id,
        authorId: active[5]!.id,
        body: `Waiting on the DST rules from @${managers[0]!.name.split(" ")[0]}.`,
      });
  }

  // Meetings (daily stand-up recurring, plus one-offs)
  const meetingSpecs = [
    { title: "Daily stand-up", day: -30, time: "10:15", dur: 15, rec: "daily" as const, who: tracked.filter((m) => m.dept === "Software") },
    { title: "Design critique", day: 1, time: "15:00", dur: 60, rec: "none" as const, who: tracked.filter((m) => m.dept === "Design") },
    { title: "Monthly all-hands", day: 0, time: "16:00", dur: 45, rec: "monthly" as const, who: active },
    { title: "Vendor review", day: 3, time: "11:30", dur: 30, rec: "none" as const, who: [managers[1]!, tracked[10]!, tracked[11]!] },
  ];
  for (const mt of meetingSpecs) {
    const [meeting] = await db
      .insert(s.meetings)
      .values({
        workspaceId: wsId,
        title: mt.title,
        startsAt: zoned(TZ, addDaysISO(today, mt.day), mt.time),
        durationMin: mt.dur,
        location: mt.rec === "daily" ? "Huddle room" : "Main conference room",
        link: "https://meet.example.com/ledgercross",
        agenda: "1. Updates\n2. Blockers\n3. Next steps",
        organizerId: managers[0]!.id,
        recurrence: mt.rec,
      })
      .returning();
    await db
      .insert(s.meetingAttendees)
      .values(mt.who.map((m) => ({ workspaceId: wsId, meetingId: meeting!.id, membershipId: m.id, rsvp: pick(["yes", "yes", "pending", "maybe"] as const) })));
  }

  // Complaints: new, reviewing, resolved.
  const complaintSpecs = [
    { by: 4, cat: "Facilities", subject: "Air conditioning broken on 3rd floor", status: "new" as const, sev: "high" as const, anon: false },
    { by: 9, cat: "Workplace", subject: "Meeting room double bookings", status: "reviewing" as const, sev: "medium" as const, anon: false },
    { by: 7, cat: "Conduct", subject: "Concern about meeting behaviour", status: "new" as const, sev: "medium" as const, anon: true },
    { by: 12, cat: "IT", subject: "VPN disconnects every hour", status: "resolved" as const, sev: "low" as const, anon: false },
  ];
  for (const c of complaintSpecs) {
    const [row] = await db
      .insert(s.complaints)
      .values({
        workspaceId: wsId,
        submitterId: active[c.by]!.id,
        anonymous: c.anon,
        category: c.cat,
        subject: c.subject,
        description: `${c.subject}. This has been happening for a few days and affects the team's work.`,
        severity: c.sev,
        status: c.status,
        assigneeId: c.status === "new" ? null : managers[1]!.id,
        resolutionMessage: c.status === "resolved" ? "The VPN concentrator was upgraded; please report again if it recurs." : null,
      })
      .returning();
    await db.insert(s.complaintEvents).values({ workspaceId: wsId, complaintId: row!.id, actorId: active[c.by]!.id, kind: "created", toStatus: "new" });
    if (c.status !== "new")
      await db.insert(s.complaintEvents).values({ workspaceId: wsId, complaintId: row!.id, actorId: managers[1]!.id, kind: "status_change", fromStatus: "new", toStatus: "reviewing" });
    if (c.status === "resolved")
      await db.insert(s.complaintEvents).values({ workspaceId: wsId, complaintId: row!.id, actorId: managers[1]!.id, kind: "status_change", fromStatus: "reviewing", toStatus: "resolved", body: "VPN upgraded." });
  }

  await db.insert(s.announcements).values([
    {
      workspaceId: wsId,
      authorId: owner.id,
      title: "Welcome to Office Ledger v2",
      body: "We've moved to the new workspace. **Check in** from the dashboard or press `Ctrl+K` and type *check in*.",
      pinned: true,
    },
    {
      workspaceId: wsId,
      authorId: managers[1]!.id,
      title: `Company retreat on ${upcomingHoliday}`,
      body: "The office is closed for the retreat. Details and transport plan to follow.",
      expiresAt: zoned(TZ, upcomingHoliday, "23:59"),
    },
  ]);

  await db.insert(s.notifications).values([
    { workspaceId: wsId, membershipId: tracked[2]!.id, kind: "leave.approved", title: "Your annual leave was approved", link: "/app/leave" },
    { workspaceId: wsId, membershipId: managers[0]!.id, kind: "inbox", title: "3 leave requests need review", link: "/app/inbox" },
    { workspaceId: wsId, membershipId: owner.id, kind: "holiday.proposed", title: `${managers[1]!.name} proposed a holiday`, link: "/app/inbox" },
  ]);

  await db.insert(s.auditLog).values([
    { workspaceId: wsId, actorUserId: owner.userId, actorMembershipId: owner.id, action: "workspace.created", entityType: "workspace", entityId: wsId, summary: "Created workspace Ledgercross" },
    { workspaceId: wsId, actorUserId: owner.userId, actorMembershipId: owner.id, action: "settings.updated", entityType: "workspace_settings", entityId: wsId, summary: "Set manager approval to Both" },
  ]);

  console.log(`\nSeeded ${tracked.length + 1} members, ${att.length} attendance rows.\n`);
  console.log("Demo logins (password for all: " + PASSWORD + ")");
  console.table([
    { role: "Owner", email: `owner@${DOMAIN}` },
    { role: "Manager", email: `manager@${DOMAIN}` },
    { role: "Manager", email: `manager2@${DOMAIN}` },
    { role: "Employee", email: `employee@${DOMAIN}` },
    { role: "Pending join", email: `pending@${DOMAIN}` },
  ]);
  console.log("Invite code: LEDGER-7Q4K");
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    await client.end();
    process.exit(1);
  });
