import { useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Globe2,
  LayoutGrid,
  Link2,
  List,
  MapPin,
  Pencil,
  Plane,
  Trash2,
  Users,
} from "lucide-react";
import { withQuery } from "../query";
import type { CalendarMonth, MeetingRow } from "@/lib/queries/calendar";
import { buildIcs, expand, rruleFor } from "@/lib/calendar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/StatTile";
import { addDaysISO, eachDay, fmtDate, fmtTime, localDate, localTime, weekday } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Data = CalendarMonth & { members: { id: string; name: string; image: string | null; role: string }[] };
type Tab = "meetings" | "leave" | "holidays";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthLabel = (m: string) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${m}-01T00:00:00`));
const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function download(name: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MonthNav({ month, setMonth, today }: { month: string; setMonth: (m: string) => void; today: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
      </Button>
      <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-8 w-40" aria-label="Choose month" />
      <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
      <h2 className="ms-1 text-base font-semibold" aria-live="polite">{monthLabel(month)}</h2>
    </div>
  );
}

/** Sun–Sat month grid. `render` fills each day cell. */
function MonthGrid({
  month,
  today,
  weekendDays,
  selected,
  onSelect,
  render,
  label,
}: {
  month: string;
  today: string;
  weekendDays: number[];
  selected?: string | null;
  onSelect?: (d: string) => void;
  render: (d: string) => React.ReactNode;
  label: string;
}) {
  const first = `${month}-01`;
  const start = addDaysISO(first, -weekday(first));
  const days = eachDay(start, addDaysISO(start, 41));
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => days.slice(w * 7, w * 7 + 7)).filter((w) => w.some((d) => d.startsWith(month)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] table-fixed border-collapse" aria-label={label}>
        <thead>
          <tr>
            {DOW.map((d, i) => (
              <th key={d} scope="col" className={cn("pb-2 text-start text-xs font-semibold uppercase tracking-wide text-muted", weekendDays.includes(i) && "opacity-70")}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => (
            <tr key={wi}>
              {w.map((d) => {
                const inMonth = d.startsWith(month);
                const weekend = weekendDays.includes(weekday(d));
                const isToday = d === today;
                return (
                  <td key={d} className="h-20 border border-border p-0 align-top">
                    <div
                      role={onSelect ? "button" : undefined}
                      tabIndex={onSelect ? 0 : undefined}
                      aria-pressed={onSelect ? selected === d : undefined}
                      aria-label={onSelect ? fmtDate(d, "en-US", { weekday: "long" }) : undefined}
                      onClick={onSelect ? () => onSelect(d) : undefined}
                      onKeyDown={onSelect ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(d)) : undefined}
                      className={cn(
                        "flex h-full min-h-20 flex-col gap-1 p-1.5 text-start transition-colors",
                        weekend && "bg-surface-2/70",
                        !inMonth && "opacity-45",
                        onSelect && "cursor-pointer hover:bg-primary-soft",
                        selected === d && "bg-primary-soft ring-2 ring-inset ring-primary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn("tabular grid size-6 place-items-center rounded-full text-xs font-medium", isToday && "bg-primary text-primary-fg")}>{Number(d.slice(8))}</span>
                        {weekend && inMonth && <span className="text-[0.65rem] text-muted">Weekend</span>}
                      </div>
                      <div className="grid min-w-0 gap-0.5">{render(d)}</div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Meetings ------------------------------------------------------------------------------------
function MeetingDialog({ open, onOpenChange, data, editing }: { open: boolean; onOpenChange: (o: boolean) => void; data: Data; editing: MeetingRow | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    setAttendees(editing ? editing.attendees.map((a) => a.id) : [data.me]);
    setRecurrence(editing?.recurrence ?? "none");
    setQ("");
  }, [open, editing, data.me]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    const { error } = await actions.calendar.saveMeeting({
      id: editing?.id,
      title: f.title ?? "",
      date: f.date ?? "",
      time: f.time ?? "",
      durationMin: Number(f.durationMin) || 30,
      location: f.location || null,
      link: f.link || null,
      agenda: f.agenda || null,
      recurrence,
      recurrenceUntil: f.until || null,
      attendeeIds: attendees,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Meeting updated" : "Meeting scheduled · invitations sent");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["calendar"] });
  }
  const start = editing ? new Date(editing.startsAt) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit meeting" : "Schedule a meeting"} className="max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Title" required><Input name="title" defaultValue={editing?.title} maxLength={140} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" required><Input type="date" name="date" defaultValue={start ? localDate(data.timezone, start) : data.today} /></Field>
            <Field label="Time" required><Input type="time" name="time" defaultValue={start ? localTime(data.timezone, start).slice(0, 5) : "11:00"} /></Field>
            <Field label="Duration">
              <Select name="durationMin" defaultValue={String(editing?.durationMin ?? 30)}>
                {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeats">
              <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
                <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </Select>
            </Field>
            {recurrence !== "none" && <Field label="Until (optional)"><Input type="date" name="until" defaultValue={editing?.recurrenceUntil ?? ""} /></Field>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location"><Input name="location" defaultValue={editing?.location ?? ""} placeholder="Main conference room" /></Field>
            <Field label="Video link"><Input name="link" type="url" defaultValue={editing?.link ?? ""} placeholder="https://" /></Field>
          </div>
          <Field label="Agenda"><Textarea name="agenda" rows={3} defaultValue={editing?.agenda ?? ""} /></Field>
          <Field label={`Attendees (${attendees.length})`}>
            <div className="grid gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter people…" aria-label="Filter people" />
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setAttendees(data.members.map((m) => m.id))}>Everyone</button>
                <button type="button" className="text-primary hover:underline" onClick={() => setAttendees([data.me])}>Just me</button>
              </div>
              <ul className="grid max-h-44 gap-0.5 overflow-auto rounded-xl border border-border p-1">
                {data.members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={attendees.includes(m.id)} onChange={(e) => setAttendees((a) => (e.target.checked ? [...a, m.id] : a.filter((x) => x !== m.id)))} />
                      <Avatar name={m.name} image={m.image} size="sm" /> {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? "Save" : "Schedule"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetail({ m, when, data, onClose, onEdit }: { m: MeetingRow | null; when: Date | null; data: Data; onClose: () => void; onEdit: (m: MeetingRow) => void }) {
  const qc = useQueryClient();
  if (!m) return null;
  const mine = m.attendees.find((a) => a.id === data.me);
  const start = when ?? new Date(m.startsAt);
  const end = new Date(start.getTime() + m.durationMin * 60000);
  async function rsvp(v: "yes" | "no" | "maybe") {
    const { error } = await actions.calendar.rsvp({ meetingId: m!.id, rsvp: v });
    if (error) return toast.error(error.message);
    toast.success("RSVP saved");
    void qc.invalidateQueries({ queryKey: ["calendar"] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={m.title} description={`${fmtDate(localDate(data.timezone, start), "en-US", { weekday: "long" })} · ${fmtTime(start, data.timezone)}–${fmtTime(end, data.timezone)}${m.recurrence !== "none" ? ` · repeats ${m.recurrence}` : ""}`}>
        <div className="grid gap-4 text-sm">
          {m.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden /> {m.location}</p>}
          {m.link && <p className="flex items-center gap-2"><Link2 className="size-4 text-muted" aria-hidden /> <a href={m.link} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">{m.link}</a></p>}
          {m.agenda && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3">{m.agenda}</p>}
          <div>
            <p className="eyebrow mb-2">Attendees · {m.attendees.filter((a) => a.rsvp === "yes").length} going</p>
            <ul className="flex flex-wrap gap-1.5">
              {m.attendees.map((a) => (
                <li key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pe-2 ps-0.5">
                  <Avatar name={a.name} image={a.image} size="sm" /> {a.name}
                  <Badge tone={a.rsvp === "yes" ? "success" : a.rsvp === "no" ? "danger" : a.rsvp === "maybe" ? "warning" : "neutral"}>{a.rsvp}</Badge>
                </li>
              ))}
            </ul>
          </div>
          {mine && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Going?</span>
              {(["yes", "maybe", "no"] as const).map((v) => (
                <Button key={v} size="sm" variant={mine.rsvp === v ? "primary" : "outline"} aria-pressed={mine.rsvp === v} onClick={() => rsvp(v)} className="capitalize">{v}</Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button size="sm" variant="ghost" onClick={() => download(`${m.title}.ics`, buildIcs(m.title, [{ uid: `${m.id}@officeledger`, title: m.title, description: m.agenda, location: m.location ?? m.link, url: m.link, start: new Date(m.startsAt), end: new Date(new Date(m.startsAt).getTime() + m.durationMin * 60000), rrule: rruleFor(m.recurrence, m.recurrenceUntil, data.weekendDays) }]))}>
              <Download aria-hidden /> .ics
            </Button>
            {data.perms.manageMeetings && (
              <>
                <Button size="sm" variant="outline" onClick={() => onEdit(m)}><Pencil aria-hidden /> Edit</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(`Cancel "${m.title}" for everyone${m.recurrence !== "none" ? " (all occurrences)" : ""}?`)) return;
                  const { error } = await actions.calendar.deleteMeeting({ id: m.id });
                  if (error) return toast.error(error.message);
                  toast.success("Meeting cancelled");
                  onClose();
                  void qc.invalidateQueries({ queryKey: ["calendar"] });
                }}><Trash2 aria-hidden /> Cancel meeting</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingsTab({ data, month, setMonth, openMeeting }: { data: Data; month: string; setMonth: (m: string) => void; openMeeting?: string | null }) {
  const [view, setView] = useState<"list" | "month" | "week">("list");
  const [weekStart, setWeekStart] = useState(() => addDaysISO(data.today, -weekday(data.today)));
  const [dialog, setDialog] = useState<{ open: boolean; editing: MeetingRow | null }>({ open: false, editing: null });
  const [detail, setDetail] = useState<{ m: MeetingRow; when: Date } | null>(null);
  const from = view === "week" ? weekStart : view === "list" ? data.today : `${month}-01`;
  const to = view === "week" ? addDaysISO(weekStart, 6) : view === "list" ? addDaysISO(data.today, 13) : addDaysISO(addDaysISO(`${month}-01`, 32).slice(0, 8) + "01", -1);
  // list/week views may need meetings outside the loaded month; fetch their own window
  const extra = useQuery({
    queryKey: ["calendar", "range", from.slice(0, 7), to.slice(0, 7)],
    queryFn: async () => {
      const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
      const res = await Promise.all(months.map((mm) => actions.calendar.month.orThrow({ month: mm })));
      const map = new Map<string, MeetingRow>();
      res.forEach((r) => r.meetings.forEach((m) => map.set(m.id, m)));
      return [...map.values()];
    },
    enabled: view !== "month",
  });
  const source = view === "month" ? data.meetings : (extra.data ?? data.meetings);
  const occ = useMemo(() => expand(source, from, to, data.timezone, data.weekendDays), [source, from, to, data.timezone, data.weekendDays]);

  useEffect(() => {
    if (!openMeeting) return;
    const m = data.meetings.find((x) => x.id === openMeeting);
    if (m) setDetail({ m, when: new Date(m.startsAt) });
  }, [openMeeting, data.meetings]);

  const mineOnly = (o: (typeof occ)[number]) => o.meeting.attendees.some((a) => a.id === data.me) || data.perms.manageMeetings;
  const visible = occ.filter(mineOnly);

  return (
    <Card>
      <CardHeader
        title="Meetings"
        description={data.perms.manageMeetings ? "All workspace meetings" : "Meetings you're invited to"}
        actions={
          <>
            <div className="flex rounded-xl bg-surface-2 p-1" role="group" aria-label="View">
              {(["list", "week", "month"] as const).map((v) => (
                <Button key={v} size="sm" variant={view === v ? "outline" : "ghost"} aria-pressed={view === v} onClick={() => setView(v)} className="capitalize">
                  {v === "list" ? <List aria-hidden /> : v === "week" ? <CalendarDays aria-hidden /> : <LayoutGrid aria-hidden />} {v}
                </Button>
              ))}
            </div>
            {data.perms.manageMeetings && <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}><CalendarPlus aria-hidden /> New meeting</Button>}
          </>
        }
      />
      <CardBody className="grid gap-4">
        {view === "month" && <MonthNav month={month} setMonth={setMonth} today={data.today} />}
        {view === "week" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="rtl:rotate-180" aria-hidden /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))} aria-label="Next week"><ChevronRight className="rtl:rotate-180" aria-hidden /></Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDaysISO(data.today, -weekday(data.today)))}>This week</Button>
            <h2 className="text-base font-semibold">{fmtDate(weekStart, "en-US", { year: undefined })} – {fmtDate(addDaysISO(weekStart, 6))}</h2>
          </div>
        )}

        {view === "list" &&
          (visible.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No meetings in the next two weeks" description={data.perms.manageMeetings ? "Schedule one with New meeting." : "Invitations will show up here."} />
          ) : (
            <div className="grid gap-5">
              {[...new Set(visible.map((o) => o.date))].map((day) => (
                <section key={day} aria-label={fmtDate(day, "en-US", { weekday: "long" })}>
                  <h3 className="eyebrow mb-2">{day === data.today ? "Today" : day === addDaysISO(data.today, 1) ? "Tomorrow" : fmtDate(day, "en-US", { weekday: "long", year: undefined })}</h3>
                  <ol className="grid gap-2">
                    {visible.filter((o) => o.date === day).map((o) => (
                      <li key={`${o.meeting.id}-${o.date}`}>
                        <button type="button" onClick={() => setDetail({ m: o.meeting, when: o.start })} className="flex w-full items-center gap-4 rounded-xl border border-border px-4 py-3 text-start transition-colors hover:bg-surface-2">
                          <span className="tabular w-20 shrink-0 text-sm font-semibold">{fmtTime(o.start, data.timezone)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{o.meeting.title}</span>
                            <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                              <span className="tabular inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{o.meeting.durationMin} min</span>
                              {o.meeting.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{o.meeting.location}</span>}
                              <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{o.meeting.attendees.length}</span>
                            </span>
                          </span>
                          {o.meeting.recurrence !== "none" && <Badge tone="info" className="capitalize">{o.meeting.recurrence}</Badge>}
                          {o.meeting.attendees.find((a) => a.id === data.me)?.rsvp === "pending" && <Badge tone="warning">RSVP</Badge>}
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ))}

        {view === "week" && (
          <div className="grid gap-2 overflow-x-auto sm:grid-cols-7">
            {eachDay(weekStart, addDaysISO(weekStart, 6)).map((d) => {
              const dayOcc = visible.filter((o) => o.date === d);
              const weekend = data.weekendDays.includes(weekday(d));
              return (
                <section key={d} className={cn("min-h-40 rounded-xl border border-border p-2", weekend && "bg-surface-2/70", d === data.today && "ring-2 ring-primary")} aria-label={fmtDate(d, "en-US", { weekday: "long" })}>
                  <p className="mb-2 text-xs font-semibold">{fmtDate(d, "en-US", { weekday: "short", year: undefined })}</p>
                  <ul className="grid gap-1">
                    {dayOcc.map((o) => (
                      <li key={o.meeting.id}>
                        <button type="button" onClick={() => setDetail({ m: o.meeting, when: o.start })} className="w-full rounded-lg bg-primary-soft px-2 py-1 text-start text-xs hover:bg-[color-mix(in_oklch,var(--primary)_22%,transparent)]">
                          <span className="tabular block font-medium text-primary">{fmtTime(o.start, data.timezone)}</span>
                          <span className="line-clamp-2">{o.meeting.title}</span>
                        </button>
                      </li>
                    ))}
                    {!dayOcc.length && <li className="text-xs text-muted">{weekend ? "Weekend" : "—"}</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {view === "month" && (
          <MonthGrid
            label="Meetings by day"
            month={month}
            today={data.today}
            weekendDays={data.weekendDays}
            render={(d) => {
              const dayOcc = visible.filter((o) => o.date === d);
              return (
                <>
                  {dayOcc.slice(0, 3).map((o) => (
                    <button key={o.meeting.id} type="button" onClick={() => setDetail({ m: o.meeting, when: o.start })} className="truncate rounded-md bg-primary-soft px-1.5 py-0.5 text-start text-[0.7rem] text-primary hover:underline">
                      {fmtTime(o.start, data.timezone)} {o.meeting.title}
                    </button>
                  ))}
                  {dayOcc.length > 3 && <span className="text-[0.7rem] text-muted">+{dayOcc.length - 3} more</span>}
                </>
              );
            }}
          />
        )}
      </CardBody>
      <MeetingDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} data={data} editing={dialog.editing} />
      <MeetingDetail m={detail?.m ?? null} when={detail?.when ?? null} data={data} onClose={() => setDetail(null)} onEdit={(m) => { setDetail(null); setDialog({ open: true, editing: m }); }} />
    </Card>
  );
}

// ---- Approved leave ------------------------------------------------------------------------------
function LeaveTab({ data, month, setMonth }: { data: Data; month: string; setMonth: (m: string) => void }) {
  const [selected, setSelected] = useState<string>(data.today.startsWith(month) ? data.today : `${month}-01`);
  const outOn = (d: string) => data.leave.filter((l) => l.startDate <= d && l.endDate >= d && !data.weekendDays.includes(weekday(d)));
  const out = outOn(selected);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader title="Approved leave" description="Who is out on each working day." />
        <CardBody className="grid gap-4">
          <MonthNav month={month} setMonth={setMonth} today={data.today} />
          <MonthGrid
            label="Approved leave by day"
            month={month}
            today={data.today}
            weekendDays={data.weekendDays}
            selected={selected}
            onSelect={setSelected}
            render={(d) => {
              const people = outOn(d);
              if (!people.length) return null;
              return (
                <span className="flex flex-wrap items-center gap-0.5">
                  {people.slice(0, 3).map((p) => <Avatar key={p.id} name={p.name} image={p.image} size="sm" className="size-6 text-[0.55rem]" />)}
                  {people.length > 3 && <span className="text-[0.7rem] text-muted">+{people.length - 3}</span>}
                </span>
              );
            }}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={fmtDate(selected, "en-US", { weekday: "long" })} description={`${out.length} ${out.length === 1 ? "person" : "people"} out`} />
        <CardBody>
          {out.length === 0 ? (
            <EmptyState icon={Plane} title="Everyone's in" className="py-6" />
          ) : (
            <ul className="grid gap-2">
              {out.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.name} image={p.image} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{p.kind === "half_day" ? `Half-day (${p.half} half)` : `${p.type ?? "Leave"} · until ${fmtDate(p.endDate, "en-US", { year: undefined })}`}{p.department ? ` · ${p.department}` : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---- Holidays ------------------------------------------------------------------------------------
function HolidaysTab({ data, month, setMonth, initialDate }: { data: Data; month: string; setMonth: (m: string) => void; initialDate?: string | null }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>(initialDate ?? (data.today.startsWith(month) ? data.today : `${month}-01`));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const h = data.holidays.find((x) => x.date === selected);
  const weekend = data.weekendDays.includes(weekday(selected));
  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar"] });

  const statusText = h?.status === "active"
    ? h.removalRequestedBy ? `Holiday: ${h.name}. Removal is waiting for owner approval.` : `This is an office holiday: ${h.name}.`
    : h?.status === "proposed"
      ? `Proposed holiday "${h.name}" is waiting for owner approval.`
      : weekend ? "This is a configured weekend day." : "This is currently a working day unless it is a configured weekend.";

  async function mark() {
    if (name.trim().length < 2) return toast.error("Give the holiday a name.");
    setBusy(true);
    const { data: res, error } = await actions.calendar.markHoliday({ date: selected, name });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(res.status === "active" ? "Holiday added" : "Proposal sent to the owner");
    setName("");
    void refresh();
  }
  async function remove() {
    if (!h) return;
    setBusy(true);
    const { data: res, error } = await actions.calendar.removeHoliday({ id: h.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(res.status === "removed" ? "Removed" : "Removal request sent to the owner");
    void refresh();
  }
  async function importYear() {
    const year = Number(month.slice(0, 4));
    setBusy(true);
    const { data: res, error } = await actions.calendar.importHolidays({ year });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${res.added} public holidays for ${res.country} ${year}${res.proposed ? " as proposals" : ""}`);
    void refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader
          title="Holiday calendar"
          description="Weekends come from Settings; holidays apply to the whole workspace."
          actions={data.perms.markHolidays && <Button size="sm" variant="outline" loading={busy} onClick={importYear}><Globe2 aria-hidden /> Import public holidays</Button>}
        />
        <CardBody className="grid gap-4">
          <MonthNav month={month} setMonth={setMonth} today={data.today} />
          <MonthGrid
            label="Holiday calendar"
            month={month}
            today={data.today}
            weekendDays={data.weekendDays}
            selected={selected}
            onSelect={setSelected}
            render={(d) => {
              const x = data.holidays.find((y) => y.date === d);
              if (!x) return null;
              return (
                <span className={cn("truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium", x.status === "active" ? "bg-violet-soft text-violet-text" : "border border-dashed border-violet text-violet-text")}>
                  {x.status === "proposed" ? "Proposed: " : ""}{x.name}
                </span>
              );
            }}
          />
        </CardBody>
      </Card>
      <Card className="self-start">
        <CardHeader eyebrow="Selected day" title={fmtDate(selected, "en-US", { weekday: "long" })} />
        <CardBody className="grid gap-4">
          <p className="text-sm">{statusText}</p>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            Click the date in the calendar to mark or remove. Owner changes apply immediately; manager changes need owner approval.
          </p>
          {data.perms.markHolidays && !weekend && !h && (
            <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void mark(); }}>
              <Field label="Holiday name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company retreat" maxLength={80} /></Field>
              <Button type="submit" loading={busy}>{data.perms.approveHolidays ? "Mark as holiday" : "Propose holiday"}</Button>
            </form>
          )}
          {data.perms.markHolidays && h && !(h.status === "active" && h.removalRequestedBy && !data.perms.approveHolidays) && (
            <Button variant="outline" onClick={remove} loading={busy}>
              <Trash2 aria-hidden /> {data.perms.approveHolidays || h.status === "proposed" ? (h.status === "proposed" ? "Withdraw proposal" : "Remove holiday") : "Request removal"}
            </Button>
          )}
          {data.perms.approveHolidays && h?.status === "proposed" && (
            <p className="text-xs text-muted">Approve proposals from the <a href="/app/inbox" className="text-primary hover:underline">Inbox</a>.</p>
          )}
          <div>
            <p className="eyebrow mb-2">Holidays this month</p>
            <ul className="grid gap-1 text-sm">
              {data.holidays.filter((x) => x.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
                <li key={x.id} className="flex justify-between gap-2">
                  <button type="button" className="truncate text-start hover:text-primary" onClick={() => setSelected(x.date)}>{x.name}</button>
                  <span className="tabular shrink-0 text-muted">{fmtDate(x.date, "en-US", { year: undefined })}{x.status === "proposed" && " · proposed"}</span>
                </li>
              ))}
              {!data.holidays.some((x) => x.date.startsWith(month)) && <li className="text-muted">None</li>}
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CalendarPage({ initial, initialTab, openMeeting, initialDate }: { initial: Data; initialTab?: Tab; openMeeting?: string | null; initialDate?: string | null }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "meetings");
  const [month, setMonth] = useState(initialDate?.slice(0, 7) ?? initial.month);
  const { data: monthData } = useQuery({
    queryKey: ["calendar", month],
    queryFn: () => actions.calendar.month.orThrow({ month }),
    initialData: month === initial.month ? initial : undefined,
    initialDataUpdatedAt: Date.now(),
    placeholderData: (prev) => prev,
  });
  const data: Data = { ...initial, ...(monthData ?? initial), members: initial.members };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="grid gap-5">
      <TabsList>
        <TabsTrigger value="meetings">Meetings</TabsTrigger>
        <TabsTrigger value="leave">Approved leave</TabsTrigger>
        <TabsTrigger value="holidays">Holiday calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="meetings"><MeetingsTab data={data} month={month} setMonth={setMonth} openMeeting={openMeeting} /></TabsContent>
      <TabsContent value="leave"><LeaveTab data={data} month={month} setMonth={setMonth} /></TabsContent>
      <TabsContent value="holidays"><HolidaysTab data={data} month={month} setMonth={setMonth} initialDate={initialDate} /></TabsContent>
    </Tabs>
  );
}

export default withQuery(CalendarPage);
