import { useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Coffee,
  History,
  House,
  LogOut,
  MapPin,
  TimerReset,
  UserCheck,
  Wifi,
  AlarmClock,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { AttendanceToday } from "@/lib/queries/attendance";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ApprovalPill, RequestPill, StatusPill } from "@/components/ui/status";
import { Avatar } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fmtDate, fmtMinutes, fmtTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Data = AttendanceToday & { missing: { membershipId: string; name: string; employeeCode: string | null }[] };
type LogRow = Data["log"][number];

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function CorrectionDialog({ open, onOpenChange, today, defaultDate }: { open: boolean; onOpenChange: (o: boolean) => void; today: string; defaultDate?: string }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setSaving(true);
    setError(null);
    const { error: err } = await actions.attendance.requestCorrection({
      date: f.date ?? today,
      checkIn: f.checkIn || null,
      checkOut: f.checkOut || null,
      reason: f.reason ?? "",
    });
    setSaving(false);
    if (err) return setError(err.message);
    toast.success("Correction sent for review");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["attendance"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Request an attendance correction" description="A manager reviews it in the Inbox. Locked daily reports show the change as a correction rather than rewriting history.">
        <form onSubmit={submit} className="grid gap-4">
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
          <Field label="Date" required>
            <Input type="date" name="date" max={today} defaultValue={defaultDate ?? today} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check in (optional)">
              <Input type="time" name="checkIn" />
            </Field>
            <Field label="Check out (optional)">
              <Input type="time" name="checkOut" />
            </Field>
          </div>
          <Field label="Reason" required hint="e.g. Forgot to check out after the client call.">
            <Textarea name="reason" rows={3} minLength={5} maxLength={500} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Send for review</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function YourCheckIn({ data }: { data: Data }) {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [mode, setMode] = useState<"office" | "remote">("office");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [breakId, setBreakId] = useState<string>("");
  const mine = data.mine;
  const refresh = () => qc.invalidateQueries({ queryKey: ["attendance"] });

  async function getPosition(): Promise<{ lat: number; lng: number } | null> {
    if (!data.settings.geoEnabled || mode !== "office" || !("geolocation" in navigator)) return null;
    return new Promise((res) =>
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { timeout: 8000, maximumAge: 60_000 },
      ),
    );
  }

  async function run(key: string, fn: () => Promise<{ error?: { message: string } | undefined; data?: unknown }>, ok?: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    if (ok) toast.success(ok);
    void refresh();
    void qc.invalidateQueries({ queryKey: ["shell"] });
  }

  async function checkIn() {
    setBusy("in");
    const pos = await getPosition();
    const { data: d, error } = await actions.attendance.checkIn({ mode, note: note || null, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(d.message);
    void refresh();
  }

  const nowLocal = fmtTime(new Date(now), data.timezone);

  if (mine?.status === "on_leave")
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-violet-soft p-4 text-violet-text">
        <CheckCircle2 className="size-5" aria-hidden />
        <p className="text-sm font-medium">You're on approved leave today. Enjoy your day off.</p>
      </div>
    );

  if (mine?.checkInAt) {
    const running = !mine.checkOutAt;
    const elapsed = running ? Math.max(0, Math.round((now - new Date(mine.checkInAt).getTime()) / 60000) - mine.breakMinutes) : mine.trackedMinutes ?? 0;
    const onBreakMin = data.openBreak ? Math.round((now - new Date(data.openBreak.startedAt).getTime()) / 60000) : 0;
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[color-mix(in_oklch,var(--success)_30%,var(--border))] bg-success-soft p-4">
          <span className="grid size-11 place-items-center rounded-xl bg-success text-white">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {running ? "You're checked in" : "You're checked out"} ·{" "}
              <span className="font-normal">
                <StatusPill status={mine.status} approval={mine.approval} />
              </span>
            </p>
            <p className="text-sm text-muted">
              Checked in at <strong className="tabular text-text">{fmtTime(mine.checkInAt, data.timezone)}</strong>
              {mine.mode === "remote" ? " · Remote" : " · Office"}
              {mine.checkOutAt && (
                <>
                  {" "}· Checked out at <strong className="tabular text-text">{fmtTime(mine.checkOutAt, data.timezone)}</strong>
                </>
              )}
            </p>
          </div>
          <div className="text-end">
            <p className="eyebrow">{running ? "Worked so far" : "Tracked"}</p>
            <p className="tabular text-xl font-semibold">{fmtMinutes(elapsed)}</p>
          </div>
        </div>
        {running && (
          <div className="flex flex-wrap items-center gap-2">
            {data.openBreak ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-text">
                  <Coffee className="size-4" aria-hidden /> On {data.openBreak.name ?? "break"} · {fmtMinutes(onBreakMin)}
                </span>
                <Button variant="outline" loading={busy === "endBreak"} onClick={() => run("endBreak", () => actions.attendance.endBreak(), "Welcome back")}>
                  <TimerReset aria-hidden /> End break
                </Button>
              </>
            ) : (
              <>
                {data.breakWindows.length > 0 && (
                  <Select value={breakId} onChange={(e) => setBreakId(e.target.value)} className="w-auto" aria-label="Break type">
                    <option value="">Unscheduled break</option>
                    {data.breakWindows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.start}–{w.end}{w.paid ? ", paid" : ""})
                      </option>
                    ))}
                  </Select>
                )}
                <Button variant="outline" loading={busy === "startBreak"} onClick={() => run("startBreak", () => actions.attendance.startBreak({ breakWindowId: breakId || null }), "Break started")}>
                  <Coffee aria-hidden /> Start break
                </Button>
              </>
            )}
            <Button variant="primary" className="ms-auto" loading={busy === "out"} onClick={() => run("out", () => actions.attendance.checkOut(), `Checked out at ${nowLocal}`)}>
              <LogOut aria-hidden /> Check out
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Where are you working today?</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {(
            [
              { v: "office", label: "Office", hint: "At the workplace", icon: Building2 },
              { v: "remote", label: "Remote", hint: `Up to ${data.settings.remoteDaysPerWeek} days/week`, icon: House },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={mode === o.v}
              onClick={() => setMode(o.v)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-start transition-colors duration-150",
                mode === o.v ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
              )}
            >
              <span className={cn("grid size-10 place-items-center rounded-xl", mode === o.v ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted")}>
                <o.icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-medium">{o.label}</span>
                <span className="text-xs text-muted">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Note (optional)" hint={`Office starts ${data.settings.officeStart}; check-ins after ${data.settings.lateThresholdMin} minutes count as late.`}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder={mode === "remote" ? "e.g. Waiting for a delivery" : ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={checkIn} loading={busy === "in"}>
          <UserCheck aria-hidden /> Check in · {nowLocal}
        </Button>
        {data.settings.geoEnabled && mode === "office" && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5" aria-hidden /> Office check-in verifies your location or office network.
          </span>
        )}
      </div>
    </div>
  );
}

function AttendancePage({ initial }: { initial: Data }) {
  const { data = initial } = useServerQuery(["attendance", "today"], () => actions.attendance.today.orThrow(), initial);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionDate, setCorrectionDate] = useState<string | undefined>();
  const tz = data.timezone;

  const columns = useMemo<ColumnDef<LogRow, unknown>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={row.original.name} image={row.original.image} size="sm" />
            <span>
              <span className="block font-medium">{row.original.name}</span>
              <span className="text-xs text-muted">{[row.original.employeeCode, row.original.department].filter(Boolean).join(" · ")}</span>
            </span>
          </span>
        ),
      },
      { id: "status", header: "Status", accessorFn: (r) => r.status, cell: ({ row }) => <StatusPill status={row.original.status} approval={row.original.approval} /> },
      { id: "mode", header: "Mode", accessorFn: (r) => r.mode ?? "", cell: ({ getValue }) => <span className="capitalize">{(getValue() as string) || "—"}</span> },
      {
        id: "in",
        header: "Check in",
        accessorFn: (r) => (r.checkInAt ? new Date(r.checkInAt).getTime() : 0),
        cell: ({ row }) => <span className="tabular">{fmtTime(row.original.checkInAt, tz)}</span>,
        meta: { csv: (r) => fmtTime(r.checkInAt, tz) },
      },
      {
        id: "out",
        header: "Check out",
        accessorFn: (r) => (r.checkOutAt ? new Date(r.checkOutAt).getTime() : 0),
        cell: ({ row }) => <span className="tabular">{fmtTime(row.original.checkOutAt, tz)}</span>,
        meta: { csv: (r) => fmtTime(r.checkOutAt, tz) },
      },
      { id: "approval", header: "Approval", accessorFn: (r) => r.approval, cell: ({ row }) => <ApprovalPill approval={row.original.approval} /> },
      { id: "note", header: "Note", accessorFn: (r) => r.note ?? "", cell: ({ getValue }) => <span className="block max-w-56 truncate text-muted">{(getValue() as string) || "—"}</span> },
    ],
    [tz],
  );

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Present" value={data.tiles.present} icon={UserCheck} tone="success" />
        <StatTile label="Late" value={data.tiles.late} icon={AlarmClock} tone="warning" />
        <StatTile label="Remote" value={data.tiles.remote} icon={Wifi} tone="info" />
        <StatTile label="Checked out" value={data.tiles.checkedOut} icon={LogOut} tone="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Your check-in"
            description={`Office hours ${data.settings.officeStart}–${data.settings.officeEnd} · ${fmtDate(data.today, "en-US", { weekday: "long" })}`}
          />
          <CardBody>
            <YourCheckIn data={data} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Corrections"
            description="Missed a checkout? Ask for a fix instead of editing history."
            actions={
              <Button variant="outline" size="sm" onClick={() => { setCorrectionDate(undefined); setCorrectionOpen(true); }}>
                <History aria-hidden /> Request
              </Button>
            }
          />
          <CardBody className="grid gap-2">
            {data.recentMine.filter((r) => r.autoCheckedOut || (r.checkInAt && !r.checkOutAt)).slice(0, 3).map((r) => (
              <div key={r.date} className="flex items-center justify-between gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm">
                <span className="text-warning-text">Missing checkout · {fmtDate(r.date, "en-US", { weekday: "short", year: undefined })}</span>
                <Button size="sm" variant="ghost" onClick={() => { setCorrectionDate(r.date); setCorrectionOpen(true); }}>Fix</Button>
              </div>
            ))}
            {data.myCorrections.length === 0 ? (
              <p className="text-sm text-muted">No correction requests yet.</p>
            ) : (
              <ul className="grid gap-2">
                {data.myCorrections.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{fmtDate(c.date)}</span>
                      <span className="block truncate text-xs text-muted">
                        {[c.requestedCheckIn && `in ${fmtTime(c.requestedCheckIn, tz)}`, c.requestedCheckOut && `out ${fmtTime(c.requestedCheckOut, tz)}`].filter(Boolean).join(" · ")} — {c.reason}
                      </span>
                      {c.reviewNote && <span className="block text-xs text-muted">Reviewer: {c.reviewNote}</span>}
                    </span>
                    <RequestPill status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={data.viewAll ? "Today's log" : "Your attendance today"}
          description={data.viewAll ? `${data.log.length} records · ${data.missing.length} not checked in yet` : undefined}
        />
        <CardBody>
          <DataTable
            caption="Today's attendance log"
            columns={columns}
            data={data.log}
            csvName={`attendance-${data.today}`}
            initialSort={[{ id: "in", desc: false }]}
            empty={<EmptyState icon={Clock3} title="No check-ins yet" description="Records appear here as people check in." />}
          />
          {data.viewAll && data.missing.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow mb-2">Not checked in</p>
              <ul className="flex flex-wrap gap-2">
                {data.missing.map((m) => (
                  <li key={m.membershipId}>
                    <a href={`/app/employees/${m.membershipId}`} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pe-3 ps-1 text-sm hover:bg-surface-2">
                      <Avatar name={m.name} size="sm" /> {m.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
      <CorrectionDialog open={correctionOpen} onOpenChange={setCorrectionOpen} today={data.today} defaultDate={correctionDate} />
    </div>
  );
}

export default withQuery(AttendancePage);
