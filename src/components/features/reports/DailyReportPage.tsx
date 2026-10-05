import { useState } from "react";
import { actions } from "astro:actions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  CalendarCheck,
  ClipboardCopy,
  Clock,
  FileWarning,
  ListTodo,
  Lock,
  Mail,
  MessageSquareWarning,
  Plane,
  Printer,
  Radio,
  UserCheck,
  UserX,
  Users,
  Wifi,
  Wrench,
  CalendarDays,
  Hourglass,
  LogOut,
  PartyPopper,
} from "lucide-react";
import { withQuery } from "../query";
import type { DailyReportData, Rollup } from "@/lib/queries/reports";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FilterTabs as Tabs,
  FilterTabsList as TabsList,
  FilterTab as TabsTrigger,
} from "@/components/ui/tabs";
import { StatTile } from "@/components/layout/StatTile";
import { addDaysISO, fmtDate, fmtDateTime, fmtMinutes, fmtTime } from "@/lib/dates";

type Period = "day" | "week" | "month";

function toText(ws: string, r: DailyReportData) {
  const a = r.data.attendance;
  const o = r.data.operational;
  return [
    `${ws} · End-of-day summary · ${r.date}${r.locked ? " (locked)" : " (live)"}`,
    "",
    `Attendance: ${a.present}/${a.expected} present · ${a.late} late · ${a.remote} remote · ${a.onLeave} on leave · ${a.absent} absent`,
    `Worked: ${fmtMinutes(o.workedMinutes)} · Half-days: ${o.halfDays} · Missing checkout: ${o.missingCheckout}`,
    `Meetings: ${o.meetings} · Open tasks: ${r.data.openTasks} (${r.data.urgentTasks} urgent, ${r.data.blockedTasks} blocked)`,
    `Pending reviews: ${r.data.pendingReviews} · Open complaints: ${r.data.openComplaints}`,
    ...(r.corrections.length
      ? ["", "Corrections after lock:", ...r.corrections.map((c) => `- ${c.description}`)]
      : []),
  ].join("\n");
}

function RollupView({ r, period }: { r: Rollup; period: "week" | "month" }) {
  const rate = r.memberDays ? Math.round((r.present / r.memberDays) * 1000) / 10 : 0;
  return (
    <div className="grid gap-6">
      <p className="text-muted text-sm">
        {period === "week" ? "Week" : "Month"} of {fmtDate(r.start)} – {fmtDate(r.end)} · {r.workdays} working
        days · {r.lockedDays} locked reports · {r.corrections} corrections
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Attendance rate"
          value={`${rate}%`}
          icon={UserCheck}
          tone="success"
          hint={`${r.present} of ${r.memberDays} member-days`}
        />
        <StatTile
          label="Worked hours"
          value={r.workedHours.toLocaleString()}
          icon={Clock}
          tone="primary"
          hint={`of ${r.expectedHours.toLocaleString()} expected`}
        />
        <StatTile label="Late arrivals" value={r.late} icon={AlarmClock} tone="warning" />
        <StatTile label="Absences" value={r.absent} icon={UserX} tone="danger" tinted={r.absent > 0} />
        <StatTile size="sm" label="Remote days" value={r.remote} icon={Wifi} tone="info" />
        <StatTile size="sm" label="Leave days" value={r.onLeave} icon={Plane} tone="violet" />
        <StatTile
          size="sm"
          label="Missing checkouts"
          value={r.missingCheckout}
          icon={FileWarning}
          tone="warning"
        />
        <StatTile size="sm" label="Tasks completed" value={r.tasksCompleted} icon={ListTodo} tone="success" />
      </div>
    </div>
  );
}

function DailyReportPage({ initial, workspace }: { initial: DailyReportData; workspace: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState(initial.date);
  const { data: r = initial, isFetching } = useQuery({
    queryKey: ["reports", "daily", date],
    queryFn: () => actions.reports.daily.orThrow({ date }),
    initialData: date === initial.date ? initial : undefined,
    initialDataUpdatedAt: Date.now(),
    placeholderData: (p) => p,
    refetchInterval: (q) => (q.state.data?.locked ? false : 60_000),
  });
  const roll = useQuery({
    queryKey: ["reports", "rollup", period, date],
    queryFn: () => actions.reports.rollup.orThrow({ period: period as "week" | "month", anchor: date }),
    enabled: period !== "day",
  });
  const [emailing, setEmailing] = useState(false);
  const a = r.data.attendance;
  const o = r.data.operational;

  async function copy() {
    await navigator.clipboard.writeText(toText(workspace, r));
    toast.success("Report copied as plain text");
  }
  async function email() {
    setEmailing(true);
    const { data, error } = await actions.reports.emailDaily({ date: r.date });
    setEmailing(false);
    if (error) return toast.error(error.message);
    toast.success(`Emailed to ${data.sent} owners and managers`);
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Date and lock status"
          description={`Locks automatically after office end time (${r.officeEnd}).`}
          actions={
            <div className="no-print flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copy}>
                <ClipboardCopy aria-hidden /> Copy text
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer aria-hidden /> Print
              </Button>
              {r.locked && (
                <Button size="sm" variant="outline" onClick={email} loading={emailing}>
                  <Mail aria-hidden /> {r.emailedAt ? "Email again" : "Email report"}
                </Button>
              )}
            </div>
          }
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="no-print">
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="no-print flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() =>
                setDate(addDaysISO(date, period === "month" ? -30 : period === "week" ? -7 : -1))
              }
              aria-label="Previous"
            >
              ‹
            </Button>
            <Input
              type="date"
              value={date}
              max={r.today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-9 w-44"
              aria-label="Report date"
            />
            <Button
              size="icon-sm"
              variant="outline"
              disabled={date >= r.today}
              onClick={() =>
                setDate(
                  addDaysISO(date, period === "month" ? 30 : period === "week" ? 7 : 1) > r.today
                    ? r.today
                    : addDaysISO(date, period === "month" ? 30 : period === "week" ? 7 : 1),
                )
              }
              aria-label="Next"
            >
              ›
            </Button>
          </div>
          {period === "day" &&
            (r.locked ? (
              <Badge tone="success">
                <Lock aria-hidden /> Locked at {r.lockedAt ? fmtTime(r.lockedAt, r.timezone) : r.officeEnd}
              </Badge>
            ) : (
              <Badge tone="info">
                <Radio aria-hidden className="animate-pulse" /> Live preview · locks at{" "}
                {fmtTime(r.lockAt, r.timezone)}
              </Badge>
            ))}
          {isFetching && <span className="text-muted text-xs">Updating…</span>}
          <span className="hidden text-sm font-medium print:inline">
            {fmtDate(r.date, "en-US", { weekday: "long" })}
          </span>
        </CardBody>
      </Card>

      {period !== "day" ? (
        roll.data ? (
          <RollupView r={roll.data} period={period} />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-28" />
            ))}
          </div>
        )
      ) : (
        <>
          {!r.data.isWorkday && (
            <p className="bg-violet-soft text-violet-text flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
              <PartyPopper className="size-4" aria-hidden />{" "}
              {o.isHoliday ? "This day is an office holiday." : "This day is a weekend."} Nobody is expected.
            </p>
          )}
          <Card>
            <CardHeader title="Attendance" description={fmtDate(r.date, "en-US", { weekday: "long" })} />
            <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile size="sm" label="Expected" value={a.expected} icon={Users} />
              <StatTile size="sm" label="Present (total)" value={a.present} icon={UserCheck} tone="success" />
              <StatTile size="sm" label="Of which late" value={a.late} icon={AlarmClock} tone="warning" />
              <StatTile size="sm" label="Of which remote" value={a.remote} icon={Wifi} tone="info" />
              <StatTile size="sm" label="On leave" value={a.onLeave} icon={Plane} tone="violet" />
              <StatTile
                size="sm"
                label="Absent"
                value={a.absent}
                icon={UserX}
                tone="danger"
                tinted={a.absent > 0}
              />
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Pending reviews" value={r.data.pendingReviews} icon={Hourglass} tone="warning" />
            <StatTile
              label="Open tasks"
              value={r.data.openTasks}
              icon={ListTodo}
              tone="primary"
              hint={`${r.data.urgentTasks} urgent · ${r.data.blockedTasks} blocked`}
            />
            <StatTile
              label="Open complaints"
              value={r.data.openComplaints}
              icon={MessageSquareWarning}
              tone="danger"
            />
            <StatTile label="Corrections" value={r.corrections.length} icon={Wrench} tone="neutral" />
          </div>

          <Card>
            <CardHeader
              title="Operational details"
              description="These values come from the same SQL resolver used by the Performance Index."
            />
            <CardBody>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { k: "Worked", v: fmtMinutes(o.workedMinutes), icon: Clock },
                  { k: "Half-days", v: o.halfDays, icon: CalendarCheck },
                  {
                    k: "Missing checkout",
                    v: `${o.missingCheckout} record${o.missingCheckout === 1 ? "" : "s"}`,
                    icon: LogOut,
                  },
                  { k: "Meetings", v: `${o.meetings} scheduled`, icon: CalendarDays },
                  { k: "Holidays", v: `${o.holidays} active this month`, icon: PartyPopper },
                ].map((x) => (
                  <div key={x.k} className="grid grid-cols-[1rem_1fr] gap-x-3">
                    <dt className="text-muted contents text-xs">
                      <x.icon className="text-muted row-span-2 mt-0.5 size-4" aria-hidden />
                      <span>{x.k}</span>
                    </dt>
                    <dd className="tabular col-start-2 font-semibold">{x.v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          {(r.locked || r.corrections.length > 0) && (
            <Card>
              <CardHeader
                title="Corrections after lock"
                description="Changes approved after this report locked. The snapshot above is never rewritten."
              />
              <CardBody>
                {r.corrections.length === 0 ? (
                  <p className="text-muted text-sm">
                    No corrections. The locked snapshot is the final record.
                  </p>
                ) : (
                  <ol className="grid gap-2">
                    {r.corrections.map((c) => (
                      <li
                        key={c.id}
                        className="border-border flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                      >
                        <span>{c.description}</span>
                        <span className="text-muted text-xs">
                          {fmtDateTime(c.createdAt, r.timezone)}
                          {c.by ? ` · ${c.by}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default withQuery(DailyReportPage);
