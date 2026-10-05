import { useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  AlarmClock,
  Briefcase,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Hourglass,
  Mail,
  MessageSquareWarning,
  Pencil,
  Phone,
  Plane,
  Power,
  Upload,
  UserX,
  Wifi,
  Trash2,
  History,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { EmployeeProfile, HeatCell } from "@/lib/queries/employees";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ApprovalPill, StatusPill } from "@/components/ui/status";
import { Avatar } from "@/components/ui/misc";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fmtDate, fmtDateTime, fmtMinutes, fmtTime, tenure } from "@/lib/dates";
import { cn } from "@/lib/cn";
import ProfileSecurity from "./ProfileSecurity";

interface Lookups {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  managers: { id: string; name: string; role: string }[];
}

const HEAT: Record<HeatCell["state"], { cls: string; label: string }> = {
  present: { cls: "bg-success", label: "Present" },
  late: { cls: "bg-warning", label: "Late" },
  remote: { cls: "bg-info", label: "Remote" },
  half_day: { cls: "bg-teal", label: "Half-day" },
  on_leave: { cls: "bg-violet", label: "On leave" },
  absent: { cls: "bg-danger", label: "Absent" },
  weekend: { cls: "bg-surface-2", label: "Weekend" },
  holiday: { cls: "bg-[color-mix(in_oklch,var(--violet)_30%,var(--surface-2))]", label: "Holiday" },
  future: { cls: "bg-surface-2 opacity-50", label: "Upcoming" },
  before: { cls: "bg-surface-2 opacity-40", label: "Before joining" },
};

function Heatmap({ cells }: { cells: HeatCell[] }) {
  // Columns are weeks; pad the first column so rows line up with weekdays (Sun..Sat).
  const first = cells[0] ? new Date(cells[0].date + "T00:00:00").getDay() : 0;
  const padded: (HeatCell | null)[] = [...Array(first).fill(null), ...cells];
  const weeks: (HeatCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  const legend: HeatCell["state"][] = ["present", "late", "remote", "half_day", "on_leave", "absent", "holiday", "weekend"];
  return (
    <div className="grid gap-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-1 pt-0 text-[0.65rem] text-muted" aria-hidden>
          {["Sun", "", "Tue", "", "Thu", "", "Sat"].map((d, i) => (
            <span key={i} className="h-3.5 leading-[0.875rem]">{d}</span>
          ))}
        </div>
        <div className="flex gap-1" role="grid" aria-label="Attendance over the last 13 weeks">
          {weeks.map((w, wi) => (
            <div key={wi} className="grid grid-rows-7 gap-1" role="row">
              {Array.from({ length: 7 }).map((_, di) => {
                const c = w[di];
                if (!c) return <span key={di} className="size-3.5" />;
                const h = HEAT[c.state];
                const label = `${fmtDate(c.date, "en-US", { weekday: "short" })}: ${h.label}`;
                return <span key={di} role="gridcell" title={label} aria-label={label} className={cn("size-3.5 rounded-[4px]", h.cls)} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {legend.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", HEAT[s].cls)} aria-hidden /> {HEAT[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="break-words text-sm">{value || "—"}</p>
      </div>
    </div>
  );
}

function CompanySheet({ open, onOpenChange, data, lookups }: { open: boolean; onOpenChange: (o: boolean) => void; data: EmployeeProfile; lookups: Lookups }) {
  const qc = useQueryClient();
  const p = data.profile;
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  async function save() {
    const f = Object.fromEntries(new FormData(formRef.current!)) as Record<string, string>;
    setBusy(true);
    const { error } = await actions.employees.updateCompany({
      id: p.id,
      employeeCode: f.employeeCode ?? "",
      departmentId: f.departmentId || null,
      designationId: f.designationId || null,
      managerId: f.managerId || null,
      joinedAt: f.joinedAt || null,
      role: data.permissions.editRole ? (f.role as "manager" | "employee") : undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Company information saved");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Edit company information"
        description={p.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} loading={busy}>Save changes</Button>
          </>
        }
      >
        <form ref={formRef} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Employee ID" required>
            <Input name="employeeCode" defaultValue={p.employeeCode ?? ""} maxLength={20} />
          </Field>
          <Field label="Designation">
            <Select name="designationId" defaultValue={p.designationId ?? ""}>
              <option value="">—</option>
              {lookups.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Department">
            <Select name="departmentId" defaultValue={p.departmentId ?? ""}>
              <option value="">—</option>
              {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Joining date">
            <Input type="date" name="joinedAt" defaultValue={p.joinedAt ?? ""} />
          </Field>
          <Field label="Reports to">
            <Select name="managerId" defaultValue={p.managerId ?? ""}>
              <option value="">—</option>
              {lookups.managers.filter((m) => m.id !== p.id).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
            </Select>
          </Field>
          {data.permissions.editRole && (
            <Field label="Role" hint="Only the organization owner can change roles.">
              <Select name="role" defaultValue={p.role}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
              </Select>
            </Field>
          )}
        </form>
      </SheetContent>
    </Dialog>
  );
}

function PersonalSheet({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: EmployeeProfile }) {
  const qc = useQueryClient();
  const p = data.profile;
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  async function save() {
    const f = Object.fromEntries(new FormData(formRef.current!)) as Record<string, string>;
    setBusy(true);
    const { error } = await actions.employees.updatePersonal({
      name: f.name ?? p.name,
      phone: f.phone || null,
      address: f.address || null,
      bloodGroup: (f.bloodGroup || null) as never,
      birthDate: f.birthDate || null,
      emergencyContact: f.ecName || f.ecPhone ? { name: f.ecName ?? "", phone: f.ecPhone ?? "", relation: f.ecRelation ?? "" } : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Edit personal information"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} loading={busy}>Save changes</Button>
          </>
        }
      >
        <form ref={formRef} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Full name" required><Input name="name" defaultValue={p.name} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={p.phone ?? ""} /></Field>
          <Field label="Address"><Textarea name="address" rows={2} defaultValue={p.address ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Blood group">
              <Select name="bloodGroup" defaultValue={p.bloodGroup ?? ""}>
                <option value="">—</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Birthday"><Input type="date" name="birthDate" defaultValue={p.birthDate ?? ""} /></Field>
          </div>
          <fieldset className="grid gap-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">Emergency contact</legend>
            <Field label="Name"><Input name="ecName" defaultValue={p.emergencyContact?.name ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input name="ecPhone" type="tel" defaultValue={p.emergencyContact?.phone ?? ""} /></Field>
              <Field label="Relation"><Input name="ecRelation" defaultValue={p.emergencyContact?.relation ?? ""} /></Field>
            </div>
          </fieldset>
        </form>
      </SheetContent>
    </Dialog>
  );
}

async function upload(form: FormData) {
  const res = await fetch("/api/files", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(body.message ?? "Upload failed");
  return body;
}

type RecordRow = EmployeeProfile["record"][number];

function ProfilePage({ initial, lookups, canTwoFactor, vapidKey }: { initial: EmployeeProfile; lookups?: Lookups; canTwoFactor: boolean; vapidKey: string }) {
  const qc = useQueryClient();
  const { data = initial } = useServerQuery(["profile", initial.profile.id], () => actions.employees.profile.orThrow({ id: initial.profile.id }), initial);
  const p = data.profile;
  const tz = data.timezone;
  const [sheet, setSheet] = useState<"company" | "personal" | null>(null);
  const [uploading, setUploading] = useState(false);
  const docInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["profile"] });

  async function onDoc(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("entityType", "membership");
    form.set("entityId", p.id);
    form.set("kind", "document");
    setUploading(true);
    try {
      await upload(form);
      toast.success("Document uploaded");
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (docInput.current) docInput.current.value = "";
    }
  }
  async function onAvatar(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("entityType", "avatar");
    try {
      await upload(form);
      toast.success("Photo updated");
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function toggleStatus() {
    const next = p.status === "active" ? "deactivated" : "active";
    if (next === "deactivated" && !confirm(`Deactivate ${p.name}? They will be signed out and lose access.`)) return;
    const { error } = await actions.employees.setStatus({ id: p.id, status: next });
    if (error) return toast.error(error.message);
    toast.success(next === "active" ? "Reactivated" : "Deactivated");
    void refresh();
  }

  const recordCols = useMemo<ColumnDef<RecordRow, unknown>[]>(
    () => [
      { id: "date", header: "Date", accessorFn: (r) => r.date, cell: ({ getValue }) => <span className="tabular">{fmtDate(getValue() as string, "en-US", { weekday: "short" })}</span> },
      { id: "status", header: "Status", accessorFn: (r) => r.status, cell: ({ row }) => <StatusPill status={row.original.status} approval={row.original.approval} /> },
      { id: "in", header: "Check in", accessorFn: (r) => r.checkInAt, cell: ({ row }) => <span className="tabular">{fmtTime(row.original.checkInAt, tz)}</span>, meta: { csv: (r) => fmtTime(r.checkInAt, tz) } },
      {
        id: "out",
        header: "Check out",
        accessorFn: (r) => r.checkOutAt,
        cell: ({ row }) => (
          <span className="tabular">
            {fmtTime(row.original.checkOutAt, tz)}
            {row.original.autoCheckedOut && <Badge tone="warning" className="ms-2">auto</Badge>}
          </span>
        ),
        meta: { csv: (r) => fmtTime(r.checkOutAt, tz) },
      },
      { id: "tracked", header: "Tracked time", accessorFn: (r) => r.trackedMinutes ?? 0, cell: ({ row }) => <span className="tabular">{fmtMinutes(row.original.trackedMinutes)}</span>, meta: { align: "end" } },
      { id: "approval", header: "Approval", accessorFn: (r) => r.approval, cell: ({ row }) => <ApprovalPill approval={row.original.approval} /> },
      { id: "note", header: "Note", accessorFn: (r) => r.note ?? "", cell: ({ getValue }) => <span className="block max-w-56 truncate text-muted">{(getValue() as string) || "—"}</span> },
    ],
    [tz],
  );

  const s = data.stats;
  return (
    <div className="grid gap-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="hero-surface border-b border-border px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-start gap-5">
            <div className="relative">
              <Avatar name={p.name} image={p.image} size="xl" />
              {data.self && (
                <>
                  <button type="button" onClick={() => avatarInput.current?.click()} className="absolute -bottom-1 -end-1 grid size-8 place-items-center rounded-full border border-border bg-surface shadow-card hover:bg-surface-2" aria-label="Change photo">
                    <Camera className="size-4" aria-hidden />
                  </button>
                  <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="eyebrow !text-primary">{p.employeeCode ?? "No employee ID"}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.designation && <Badge tone="primary">{p.designation}</Badge>}
                {p.department && <Badge tone="info">{p.department}</Badge>}
                <Badge tone="violet" className="capitalize">{p.role}</Badge>
                {p.status !== "active" && <Badge tone="danger" className="capitalize">{p.status}</Badge>}
                {p.managerName && <Badge tone="outline">Reports to {p.managerName}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.permissions.editPersonal && <Button variant="outline" onClick={() => setSheet("personal")}><Pencil aria-hidden /> Edit personal info</Button>}
              {data.permissions.editCompany && lookups && <Button variant="outline" onClick={() => setSheet("company")}><Briefcase aria-hidden /> Edit company info</Button>}
              {data.permissions.deactivate && (
                <Button variant={p.status === "active" ? "ghost" : "success"} onClick={toggleStatus}>
                  {p.status === "active" ? <UserX aria-hidden /> : <Power aria-hidden />} {p.status === "active" ? "Deactivate" : "Reactivate"}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-3 sm:px-7">
          <div className="grid gap-3">
            <p className="eyebrow">Contact</p>
            <InfoRow icon={Mail} label="Email" value={<a className="hover:text-primary" href={`mailto:${p.email}`}>{p.email}</a>} />
            <InfoRow icon={Phone} label="Phone" value={p.phone} />
          </div>
          <div className="grid gap-3">
            <p className="eyebrow">Personal</p>
            <InfoRow icon={FileText} label="Address" value={p.address} />
            <InfoRow icon={CheckCircle2} label="Blood group" value={p.bloodGroup} />
            {(data.self || data.permissions.editCompany) && p.emergencyContact && (
              <InfoRow icon={Phone} label="Emergency contact" value={`${p.emergencyContact.name} · ${p.emergencyContact.phone}${p.emergencyContact.relation ? ` (${p.emergencyContact.relation})` : ""}`} />
            )}
          </div>
          <div className="grid gap-3">
            <p className="eyebrow">Employment</p>
            <InfoRow icon={CalendarCheck2} label="Joined" value={p.joinedAt ? fmtDate(p.joinedAt) : null} />
            <InfoRow icon={Hourglass} label="Tenure" value={p.joinedAt ? `${tenure(p.joinedAt, data.today)} with the company` : null} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Attendance days" value={s.attendanceDays} icon={CalendarCheck2} tone="success" />
        <StatTile label="Worked hours" value={Math.round(s.trackedMinutes / 60).toLocaleString()} icon={Clock3} tone="primary" />
        <StatTile label="Completed days" value={s.completedDays} icon={CheckCircle2} tone="info" />
        <StatTile label="Issues" value={s.issues} icon={MessageSquareWarning} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Employment summary" />
          <CardBody className="grid grid-cols-2 gap-4">
            {[
              ["Tenure", p.joinedAt ? tenure(p.joinedAt, data.today) : "—"],
              ["Attendance days", s.attendanceDays],
              ["Complaints", s.issues],
              ["Completed days", s.completedDays],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="tabular mt-0.5 font-semibold">{v}</p>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Leave balance" description={`${data.today.slice(0, 4)} · accrued to date`} />
          <CardBody className="grid gap-3">
            {data.balances.length === 0 && <p className="text-sm text-muted">No leave types configured.</p>}
            {data.balances.map((b) => {
              const total = b.accrued + b.carriedOver;
              const pct = total ? Math.min(100, (b.used / total) * 100) : 0;
              return (
                <div key={b.leaveTypeId}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{b.name}{!b.paid && <span className="text-xs text-muted"> · unpaid</span>}</span>
                    <span className="tabular text-muted">
                      {b.paid ? <><strong className="text-text">{b.remaining}</strong> left of {total}</> : `${b.used} used`}
                      {b.pending > 0 && ` · ${b.pending} pending`}
                    </span>
                  </div>
                  {b.paid && (
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={b.used} aria-valuemin={0} aria-valuemax={total} aria-label={`${b.name} used`}>
                      <div className="h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Attendance heatmap" description="Last 13 weeks, one square per day." />
        <CardBody><Heatmap cells={data.heatmap} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Working hours" description="Tracked time from check-in to check-out, minus breaks." />
        <CardBody className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile size="sm" label="Total worked" value={fmtMinutes(s.trackedMinutes)} />
            <StatTile size="sm" label="Average per day" value={fmtMinutes(s.avgMinutes)} />
            <StatTile size="sm" label="Most recent check-in" value={s.lastIn ? fmtTime(s.lastIn, tz) : "—"} hint={s.lastIn ? fmtDateTime(s.lastIn, tz).split(",").slice(0, 2).join(",") : undefined} />
            <StatTile size="sm" label="Most recent check-out" value={s.lastOut ? fmtTime(s.lastOut, tz) : "—"} hint={s.lastOut ? fmtDateTime(s.lastOut, tz).split(",").slice(0, 2).join(",") : undefined} />
          </div>
          <DataTable
            caption="Working hours"
            data={data.workingHours}
            pageSize={10}
            columns={[
              { id: "date", header: "Date", accessorFn: (r) => r.date, cell: ({ getValue }) => <span className="tabular">{fmtDate(getValue() as string, "en-US", { weekday: "short" })}</span> },
              { id: "in", header: "Check in", accessorFn: (r) => r.checkInAt, cell: ({ row }) => <span className="tabular">{fmtTime(row.original.checkInAt, tz)}</span> },
              { id: "out", header: "Check out", accessorFn: (r) => r.checkOutAt, cell: ({ row }) => <span className="tabular">{fmtTime(row.original.checkOutAt, tz)}</span> },
              { id: "worked", header: "Worked", accessorFn: (r) => r.trackedMinutes ?? 0, cell: ({ row }) => <span className="tabular">{fmtMinutes(row.original.trackedMinutes)}</span>, meta: { align: "end" } },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Attendance record" description="Most recent 90 days with attendance status, approval state, notes, and tracked time." />
        <CardBody className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile size="sm" label="Present" value={data.summary90.present} icon={CheckCircle2} tone="success" />
            <StatTile size="sm" label="Late" value={data.summary90.late} icon={AlarmClock} tone="warning" />
            <StatTile size="sm" label="Remote" value={data.summary90.remote} icon={Wifi} tone="info" />
            <StatTile size="sm" label="On leave" value={data.summary90.onLeave} icon={Plane} tone="violet" />
            <StatTile size="sm" label="Absent" value={data.summary90.absent} icon={UserX} tone="danger" tinted={data.summary90.absent > 0} />
          </div>
          <DataTable caption="Attendance record" columns={recordCols} data={data.record} csvName={`attendance-${p.employeeCode ?? p.id}`} pageSize={15} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {data.documents && (
          <Card>
            <CardHeader
              title="Documents"
              description="Contracts, IDs and certificates. Private; links expire after 10 minutes."
              actions={
                data.permissions.uploadDocs && (
                  <>
                    <Button size="sm" variant="outline" loading={uploading} onClick={() => docInput.current?.click()}><Upload aria-hidden /> Upload</Button>
                    <input ref={docInput} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.csv" onChange={(e) => onDoc(e.target.files?.[0])} />
                  </>
                )
              }
            />
            <CardBody>
              {data.documents.length === 0 ? (
                <EmptyState icon={FileText} title="No documents yet" description="Upload a contract or ID document (PDF, image, Word or Excel)." className="py-6" />
              ) : (
                <ul className="grid gap-2">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                      <a href={d.url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">{d.filename}</a>
                      <span className="tabular text-xs text-muted">{(d.size / 1024).toFixed(0)} KB</span>
                      {data.permissions.uploadDocs && (
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${d.filename}`} onClick={async () => {
                          if (!confirm(`Delete ${d.filename}?`)) return;
                          const { error } = await actions.employees.deleteDocument({ fileId: d.id });
                          if (error) return toast.error(error.message);
                          void refresh();
                        }}><Trash2 aria-hidden /></Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Activity" description="Recent changes and requests." />
          <CardBody>
            {data.timeline.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" className="py-6" />
            ) : (
              <ol className="relative grid gap-4 border-s border-border ps-5">
                {data.timeline.map((t) => (
                  <li key={t.id} className="relative">
                    <span className="absolute -start-[1.6rem] top-1 size-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
                    <p className="text-sm">{t.text}</p>
                    <p className="text-xs text-muted">{fmtDateTime(t.at, tz)}{t.by ? ` · ${t.by}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      {data.self && <ProfileSecurity canTwoFactor={canTwoFactor} prefs={p.notifyPrefs} icalToken={p.icalToken} vapidKey={vapidKey} />}

      {lookups && <CompanySheet open={sheet === "company"} onOpenChange={(o) => setSheet(o ? "company" : null)} data={data} lookups={lookups} />}
      <PersonalSheet open={sheet === "personal"} onOpenChange={(o) => setSheet(o ? "personal" : null)} data={data} />
    </div>
  );
}

export default withQuery(ProfilePage);
