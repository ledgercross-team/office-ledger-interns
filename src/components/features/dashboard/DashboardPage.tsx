import { lazy, Suspense, useState } from "react";
import { actions } from "astro:actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowRight,
  Ban,
  Cake,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Eye,
  EyeOff,
  Flame,
  Inbox,
  KeyRound,
  ListTodo,
  MessageSquareWarning,
  PartyPopper,
  Plane,
  RefreshCw,
  Siren,
  Timer,
  UserCheck,
  UserX,
  Wifi,
  Award,
  type LucideIcon,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { DashboardData } from "@/lib/queries/reports";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { PriorityChip, StatusPill } from "@/components/ui/status";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
// Recharts is ~380 KB; load it after the dashboard shell has rendered.
const MomentumChart = lazy(() => import("../charts/charts").then((m) => ({ default: m.MomentumChart })));
const MixDonut = lazy(() => import("../charts/charts").then((m) => ({ default: m.MixDonut })));
const ChartSkeleton = ({ h = 220 }: { h?: number }) => (
  <div className="skeleton" style={{ height: h }} aria-hidden />
);
import { fmtDate, fmtMinutes, fmtTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Org = Extract<DashboardData, { mode: "org" }>;
type Emp = Extract<DashboardData, { mode: "employee" }>;

function AttendanceCard({ d }: { d: DashboardData }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const me = d.myAttendance;
  return (
    <Card>
      <CardHeader
        title="Attendance"
        actions={
          <a href="/app/attendance" className="text-primary text-sm hover:underline">
            Full history
          </a>
        }
      />
      <CardBody>
        {me?.checkInAt ? (
          <div className="flex items-center gap-3">
            <span className="bg-success-soft text-success-text grid size-10 place-items-center rounded-xl">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-medium">{me.checkOutAt ? "You're checked out" : "You're checked in"}</p>
              <p className="text-muted flex flex-wrap items-center gap-1.5 text-sm">
                <StatusPill status={me.status} approval={me.approval} /> · {fmtTime(me.checkInAt, d.timezone)}
                {me.checkOutAt && ` – ${fmtTime(me.checkOutAt, d.timezone)}`}
              </p>
            </div>
          </div>
        ) : me?.status === "on_leave" ? (
          <p className="text-violet-text flex items-center gap-2 text-sm">
            <Plane className="size-4" aria-hidden /> You're on leave today.
          </p>
        ) : (
          <div className="grid gap-3">
            <p className="text-muted text-sm">
              You haven't checked in yet. Office starts at {d.officeStart}.
            </p>
            <div className="flex gap-2">
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const { data, error } = await actions.attendance.checkIn({ mode: "office" });
                  setBusy(false);
                  if (error) return toast.error(error.message);
                  toast.success(data.message);
                  void qc.invalidateQueries({ queryKey: ["dashboard"] });
                }}
              >
                <UserCheck aria-hidden /> Check in
              </Button>
              <Button asChild variant="outline">
                <a href="/app/attendance">Remote…</a>
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function InviteCard({ invite }: { invite: NonNullable<Org["invite"]> }) {
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState(invite.code);
  const [busy, setBusy] = useState(false);
  const masked = code.replace(/(?<=-).*/, (m) => "•".repeat(m.length));
  return (
    <Card>
      <CardHeader title="Invite employees" description="Share this code with employees to request access." />
      <CardBody className="grid gap-3">
        <div className="border-border bg-surface-2 flex items-center gap-2 rounded-xl border px-3 py-2">
          <KeyRound className="text-muted size-4" aria-hidden />
          <code
            className="tabular flex-1 font-mono text-base tracking-wider"
            aria-label={shown ? `Invite code ${code}` : "Invite code hidden"}
          >
            {shown ? code : masked}
          </code>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide code" : "Show code"}
          >
            {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(code).then(() => toast.success("Invite code copied"))
            }
          >
            <Copy aria-hidden /> Copy
          </Button>
        </div>
        {invite.expiresAt && (
          <p className="text-muted text-xs">Expires {fmtDate(new Date(invite.expiresAt))}</p>
        )}
        {invite.canRegenerate && (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            loading={busy}
            onClick={async () => {
              if (!confirm("Regenerate the invite code? The old code stops working immediately.")) return;
              setBusy(true);
              const { data, error } = await actions.workspace.regenerateInvite({ expiresInDays: 0 });
              setBusy(false);
              if (error) return toast.error(error.message);
              setCode(data.code);
              setShown(true);
              toast.success("New invite code generated");
            }}
          >
            <RefreshCw aria-hidden /> Regenerate
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function QuickActions({ mode }: { mode: "org" | "employee" }) {
  const items: { href: string; label: string; description: string; icon: LucideIcon }[] =
    mode === "org"
      ? [
          { href: "/app/inbox", label: "Review inbox", description: "Clear pending approvals", icon: Inbox },
          {
            href: "/app/tasks?new=1",
            label: "Create a task",
            description: "Add work to the board",
            icon: ListTodo,
          },
          {
            href: "/app/calendar",
            label: "Open calendar",
            description: "Plan the next workday",
            icon: CalendarDays,
          },
          {
            href: "/app/attendance",
            label: "Check attendance",
            description: "See today's coverage",
            icon: UserCheck,
          },
        ]
      : [
          {
            href: "/app/attendance",
            label: "Open attendance",
            description: "Check in or review history",
            icon: UserCheck,
          },
          {
            href: "/app/leave?new=1",
            label: "Request leave",
            description: "Start a time-off request",
            icon: Plane,
          },
          { href: "/app/tasks", label: "View my tasks", description: "Keep work moving", icon: ListTodo },
          {
            href: "/app/calendar",
            label: "Open calendar",
            description: "See meetings and holidays",
            icon: CalendarDays,
          },
        ];

  return (
    <Card>
      <CardHeader title="Quick actions" description="Jump straight into the next thing." />
      <CardBody className="grid gap-2">
        {items.map(({ href, label, description, icon: Icon }) => (
          <a
            key={href}
            href={href}
            className="group hover:border-border hover:bg-surface-2 flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-[background-color,border-color]"
          >
            <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-150 group-hover:scale-105">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="text-muted block truncate text-xs">{description}</span>
            </span>
            <ArrowRight
              className="text-muted size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180"
              aria-hidden
            />
          </a>
        ))}
      </CardBody>
    </Card>
  );
}

function briefingText(d: Org, workspace: string) {
  const a = d.report.attendance;
  return [
    `${workspace} · Daily brief · ${fmtDate(d.today, "en-US", { weekday: "long" })}`,
    `Attendance: ${a.present}/${a.expected} checked in (${d.coverage}%) · ${a.late} late · ${a.remote} remote · ${a.onLeave} on leave · ${a.absent} not in`,
    `Tasks: ${d.report.openTasks} open · ${d.report.urgentTasks} urgent · ${d.report.blockedTasks} blocked`,
    `Meetings today: ${
      d.meetings
        .filter((m) => m.date === d.today)
        .map((m) => `${fmtTime(m.start, d.timezone)} ${m.title}`)
        .join("; ") || "none"
    }`,
    `Issues: ${d.report.openComplaints} open · Inbox: ${d.inbox} waiting`,
    ...(d.outToday.length ? [`Out today: ${d.outToday.map((o) => o.name).join(", ")}`] : []),
  ].join("\n");
}

function People({ d }: { d: DashboardData }) {
  return (
    <Card>
      <CardHeader
        title="Who's out today"
        description={d.outToday.length ? `${d.outToday.length} on approved leave` : undefined}
      />
      <CardBody className="grid gap-5">
        {d.outToday.length === 0 ? (
          <p className="text-muted text-sm">Everyone's in today.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.outToday.map((p) => (
              <li
                key={p.id}
                title={`${p.name} · ${p.kind === "half_day" ? "half-day" : (p.type ?? "leave")}`}
                className="border-border inline-flex items-center gap-1.5 rounded-full border py-0.5 ps-0.5 pe-2.5 text-sm"
              >
                <Avatar name={p.name} image={p.image} size="sm" /> {p.name.split(" ")[0]}
                {p.kind === "half_day" && <Badge tone="teal">½</Badge>}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Upcoming holidays</p>
            {d.holidays.length === 0 ? (
              <p className="text-muted text-sm">None in the next 60 days.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {d.holidays.map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <PartyPopper className="text-violet size-4" aria-hidden />{" "}
                    <span className="flex-1 truncate">{h.name}</span>{" "}
                    <span className="tabular text-muted">
                      {fmtDate(h.date, "en-US", { year: undefined })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow mb-2">Birthdays & anniversaries</p>
            {d.celebrations.length === 0 ? (
              <p className="text-muted text-sm">Nothing in the next two weeks.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {d.celebrations.slice(0, 5).map((c) => (
                  <li key={`${c.id}-${c.kind}`} className="flex items-center gap-2">
                    {c.kind === "birthday" ? (
                      <Cake className="text-danger size-4" aria-hidden />
                    ) : (
                      <Award className="text-warning size-4" aria-hidden />
                    )}
                    <span className="flex-1 truncate">
                      {c.name}
                      {c.kind === "anniversary" && ` · ${c.years} yr${c.years === 1 ? "" : "s"}`}
                    </span>
                    <span className="tabular text-muted">
                      {c.date === d.today ? "Today" : fmtDate(c.date, "en-US", { year: undefined })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function OrgDashboard({ d, workspace }: { d: Org; workspace: string }) {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [series, setSeries] = useState<("present" | "late" | "remote")[]>(["present"]);
  const { data: points = d.series } = useQuery({
    queryKey: ["dashboard", "series", days],
    queryFn: () => actions.reports.series.orThrow({ days }),
    initialData: days === 7 ? d.series : undefined,
    initialDataUpdatedAt: Date.now(),
    placeholderData: (p) => p,
  });
  const a = d.report.attendance;
  const p = d.previous?.attendance;
  const delta = (now: number, prev: number | undefined, positiveIsGood = true) =>
    prev === undefined ? null : { value: now - prev, positiveIsGood, label: "vs last workday" };
  const meetingsToday = d.meetings.filter((m) => m.date === d.today);

  return (
    <div className="grid gap-6">
      {d.inbox > 0 && (
        <a
          href="/app/inbox"
          className="group bg-primary-soft flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] px-5 py-4 transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_16%,transparent)]"
        >
          <span className="bg-primary text-primary-fg grid size-10 place-items-center rounded-xl">
            <Inbox className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="tabular block font-semibold">
              {d.inbox} update{d.inbox === 1 ? "" : "s"} need attention
            </span>
            <span className="text-muted text-sm">Review joins, leave, attendance, and complaints</span>
          </span>
          <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
            Open inbox{" "}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
              aria-hidden
            />
          </span>
        </a>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader
              title="Coverage"
              description={`${a.present} of ${a.expected - a.onLeave} expected people checked in`}
            />
            <CardBody className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="eyebrow">Check-in coverage</p>
                    <p className="tabular text-3xl font-semibold">{d.coverage}%</p>
                  </div>
                  <Progress value={d.coverage} tone="success" label="Check-in coverage" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <p
                      className="eyebrow"
                      title="Minutes worked so far by people who checked in ÷ office minutes elapsed"
                    >
                      Worked rate
                    </p>
                    <p className="tabular text-3xl font-semibold">{d.workedRate}%</p>
                  </div>
                  <Progress value={d.workedRate} tone="primary" label="Worked rate" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <StatTile
                  size="sm"
                  label="Late"
                  value={a.late}
                  icon={AlarmClock}
                  tone="warning"
                  delta={delta(a.late, p?.late, false)}
                />
                <StatTile
                  size="sm"
                  label="Remote"
                  value={a.remote}
                  icon={Wifi}
                  tone="info"
                  delta={delta(a.remote, p?.remote)}
                />
                <StatTile size="sm" label="On leave" value={a.onLeave} icon={Plane} tone="violet" />
                <StatTile
                  size="sm"
                  label="Absent"
                  value={a.absent}
                  icon={UserX}
                  tone="danger"
                  tinted={a.absent > 0}
                  hint={d.report.isWorkday ? "not checked in yet" : "day off"}
                />
                <StatTile
                  size="sm"
                  label="Pending tasks"
                  value={d.report.openTasks}
                  icon={ListTodo}
                  tone="primary"
                />
                <StatTile
                  size="sm"
                  label="Open issues"
                  value={d.report.openComplaints}
                  icon={MessageSquareWarning}
                  tone="danger"
                />
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    Attendance momentum{" "}
                    <Badge tone="success">
                      <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden /> Live
                    </Badge>
                  </span>
                }
                description="People checked in per day"
                actions={
                  <div className="bg-surface-2 flex rounded-lg p-0.5" role="group" aria-label="Range">
                    {([7, 30, 90] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={days === n}
                        onClick={() => setDays(n)}
                        className={cn(
                          "tabular rounded-md px-2 py-0.5 text-xs font-medium",
                          days === n ? "bg-surface shadow-card" : "text-muted",
                        )}
                      >
                        {n}d
                      </button>
                    ))}
                  </div>
                }
              />
              <CardBody className="grid gap-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Series">
                  {(["present", "late", "remote"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={series.includes(k)}
                      onClick={() =>
                        setSeries((s) =>
                          s.includes(k) ? (s.length > 1 ? s.filter((x) => x !== k) : s) : [...s, k],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs capitalize",
                        series.includes(k)
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border text-muted",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                  <MomentumChart data={points.filter((x) => x.isWorkday)} series={series} />
                </Suspense>
                <p className="text-muted text-xs">Working days only; weekends and holidays are skipped.</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Operations mix" description="Today" />
              <CardBody>
                <Suspense fallback={<ChartSkeleton h={240} />}>
                  <MixDonut
                    values={{
                      present: Math.max(0, a.present - a.late - a.remote),
                      late: a.late,
                      remote: a.remote,
                      onLeave: a.onLeave,
                      absent: a.absent,
                    }}
                  />
                </Suspense>
              </CardBody>
            </Card>
          </div>

          <People d={d} />
        </div>

        <div className="grid content-start gap-6">
          {d.invite && <InviteCard invite={d.invite} />}
          <QuickActions mode="org" />
          <AttendanceCard d={d} />
          <Card>
            <CardHeader
              title="Daily briefing"
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(briefingText(d, workspace))
                      .then(() => toast.success("Briefing copied"))
                  }
                >
                  <ClipboardCopy aria-hidden /> Copy
                </Button>
              }
            />
            <CardBody className="grid gap-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { k: "Meetings", v: meetingsToday.length, icon: CalendarDays },
                  { k: "Urgent tasks", v: d.report.urgentTasks, icon: Siren },
                  { k: "Blocked", v: d.report.blockedTasks, icon: Ban },
                ].map((x) => (
                  <div key={x.k} className="bg-surface-2 rounded-xl p-2.5">
                    <x.icon className="text-muted mx-auto size-4" aria-hidden />
                    <p className="tabular mt-1 text-xl font-semibold">{x.v}</p>
                    <p className="text-muted text-xs">{x.k}</p>
                  </div>
                ))}
              </div>
              {meetingsToday.length > 0 && (
                <ul className="grid gap-1.5 text-sm">
                  {meetingsToday.map((m) => (
                    <li key={m.id} className="flex gap-2">
                      <span className="tabular text-muted w-20 shrink-0 whitespace-nowrap">
                        {fmtTime(m.start, d.timezone)}
                      </span>
                      <a href={`/app/calendar?meeting=${m.id}`} className="hover:text-primary truncate">
                        {m.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <a href="/app/reports/daily" className="text-primary text-sm hover:underline">
                Open the full end-of-day report →
              </a>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmployeeDashboard({ d }: { d: Emp }) {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Attendance streak"
          value={`${d.streak} day${d.streak === 1 ? "" : "s"}`}
          icon={Flame}
          tone="warning"
          hint="consecutive working days"
        />
        <StatTile label="Hours this week" value={fmtMinutes(d.weekMinutes)} icon={Timer} tone="primary" />
        <StatTile
          label="Leave left"
          value={d.balances.filter((b) => b.paid).reduce((a, b) => a + b.remaining, 0)}
          icon={Plane}
          tone="violet"
          hint={d.pendingLeave ? `${d.pendingLeave} request pending` : "days, all paid types"}
        />
        <StatTile label="My open tasks" value={d.myTasks.length} icon={ListTodo} tone="info" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader
              title="My tasks"
              actions={
                <a href="/app/tasks" className="text-primary text-sm hover:underline">
                  Taskboard
                </a>
              }
            />
            <CardBody>
              {d.myTasks.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="Nothing assigned"
                  description="Tasks assigned to you will show up here."
                  className="py-6"
                />
              ) : (
                <ul className="grid gap-2">
                  {d.myTasks.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`/app/tasks?task=${t.id}`}
                        className="border-border hover:bg-surface-2 flex items-center gap-3 rounded-xl border px-3 py-2"
                      >
                        <span className="flex-1 truncate text-sm font-medium">{t.title}</span>
                        {t.dueDate && (
                          <span
                            className={cn(
                              "tabular text-xs",
                              t.dueDate < d.today ? "text-danger-text" : "text-muted",
                            )}
                          >
                            {fmtDate(t.dueDate, "en-US", { year: undefined })}
                          </span>
                        )}
                        <PriorityChip priority={t.priority} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="My meetings"
              description="Next 7 days"
              actions={
                <a href="/app/calendar" className="text-primary text-sm hover:underline">
                  Calendar
                </a>
              }
            />
            <CardBody>
              {d.meetings.length === 0 ? (
                <p className="text-muted text-sm">No meetings this week.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {d.meetings.slice(0, 8).map((m) => (
                    <li key={`${m.id}-${m.date}`} className="flex gap-3">
                      <span className="tabular text-muted w-36 shrink-0 whitespace-nowrap">
                        {m.date === d.today
                          ? "Today"
                          : fmtDate(m.date, "en-US", { weekday: "short", year: undefined })}{" "}
                        {fmtTime(m.start, d.timezone)}
                      </span>
                      <a href={`/app/calendar?meeting=${m.id}`} className="hover:text-primary truncate">
                        {m.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <People d={d} />
        </div>
        <div className="grid content-start gap-6">
          <QuickActions mode="employee" />
          <AttendanceCard d={d} />
          <Card>
            <CardHeader
              title="Leave balance"
              actions={
                <a href="/app/leave?new=1" className="text-primary text-sm hover:underline">
                  Request
                </a>
              }
            />
            <CardBody className="grid gap-2">
              {d.balances.map((b) => (
                <div key={b.leaveTypeId} className="flex justify-between text-sm">
                  <span>{b.name}</span>
                  <span className="tabular text-muted">
                    {b.paid ? (
                      <>
                        <strong className="text-text">{b.remaining}</strong> / {b.accrued + b.carriedOver}
                      </>
                    ) : (
                      `${b.used} used`
                    )}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ initial, workspace }: { initial: DashboardData; workspace: string }) {
  const { data = initial } = useServerQuery(
    ["dashboard"],
    () => actions.reports.dashboard.orThrow(),
    initial,
  );
  return data.mode === "org" ? (
    <OrgDashboard d={data} workspace={workspace} />
  ) : (
    <EmployeeDashboard d={data} />
  );
}

export default withQuery(DashboardPage);
