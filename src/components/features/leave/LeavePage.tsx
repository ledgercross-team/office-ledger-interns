import { useEffect, useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Info, ListChecks, Paperclip, Plane, Plus, XCircle } from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { LeavePageData, LeaveRow } from "@/lib/queries/leave";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestPill } from "@/components/ui/status";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Kind = "full_day" | "half_day";
type StatusFilter = "pending" | "approved" | "rejected" | "all";

function range(r: Pick<LeaveRow, "startDate" | "endDate">) {
  return r.startDate === r.endDate ? fmtDate(r.startDate, "en-US", { weekday: "short" }) : `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}`;
}

function RequestCard({ r, reviewer, onDecide, onCancel, busy, tz }: { r: LeaveRow; tz: string; reviewer: boolean; onDecide?: (id: string, d: "approve" | "reject") => void; onCancel?: (id: string) => void; busy: boolean }) {
  const crowded = r.overlap >= 2 || (r.deptSize > 2 && r.overlap / r.deptSize >= 0.3);
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {r.kind === "half_day" ? `Half-day (${r.half} half): ${range(r)}` : `${r.type ?? "Leave"} leave: ${range(r)}`}
          </h3>
          {reviewer ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <Avatar name={r.name} image={r.image} size="sm" />
              Requested by <a href={`/app/employees/${r.membershipId}`} className="font-medium text-text hover:text-primary">{r.name}</a>
              {r.department && <span>· {r.department}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted">{r.days} day{r.days === 1 ? "" : "s"} · {r.type}</p>
          )}
        </div>
        <RequestPill status={r.status} />
      </div>
      <p className="text-sm">{r.reason}</p>
      {reviewer && r.status === "pending" && r.overlap > 0 && (
        <p className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", crowded ? "bg-warning-soft text-warning-text" : "bg-surface-2 text-muted")}>
          <AlertTriangle className="size-3.5" aria-hidden />
          {r.overlap} other{r.overlap > 1 ? "s" : ""} in {r.department ?? "this team"} {r.overlap > 1 ? "are" : "is"} also off on these days
        </p>
      )}
      {r.reviewNote && <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">Reviewer note: {r.reviewNote}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
        <span>Requested {fmtDateTime(r.createdAt, tz)}</span>
        {r.reviewerName && r.status !== "pending" && <span>· by {r.reviewerName}</span>}
        <span className="ms-auto flex gap-1.5">
          {reviewer && r.canReview && onDecide && (
            <>
              <Button size="sm" variant="success" onClick={() => onDecide(r.id, "approve")} disabled={busy}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(r.id, "reject")} disabled={busy}>Reject</Button>
            </>
          )}
          {!reviewer && r.status === "pending" && onCancel && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(r.id)} disabled={busy}>Cancel request</Button>
          )}
        </span>
      </div>
    </article>
  );
}

function RequestDialog({ open, onOpenChange, data, defaultKind }: { open: boolean; onOpenChange: (o: boolean) => void; data: LeavePageData; defaultKind: Kind }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(data.today);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setKind(defaultKind), [defaultKind, open]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    const { data: res, error: err } = await actions.leave.request({
      leaveTypeId: f.leaveTypeId ?? "",
      kind,
      half: kind === "half_day" ? ((f.half as "first" | "second") ?? "first") : null,
      startDate: f.startDate ?? "",
      endDate: kind === "half_day" ? (f.startDate ?? "") : (f.endDate ?? ""),
      reason: f.reason ?? "",
    });
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    const file = fileRef.current?.files?.[0];
    if (file) {
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", "leave_request");
      form.set("entityId", res.id);
      const up = await fetch("/api/files", { method: "POST", body: form });
      if (!up.ok) toast.error(((await up.json().catch(() => ({}))) as { message?: string }).message ?? "Attachment failed");
    }
    setBusy(false);
    toast.success(`Request sent · ${res.days} day${res.days === 1 ? "" : "s"}`);
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["leave"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Request leave" description="Weekends and office holidays are not counted.">
        <form onSubmit={submit} className="grid gap-4">
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Request type">
            {(["full_day", "half_day"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("rounded-lg py-1.5 text-sm font-medium", kind === k ? "bg-surface shadow-card" : "text-muted")}>
                {k === "full_day" ? "Full-day leave" : "Half-day"}
              </button>
            ))}
          </div>
          <Field label="Leave type" required>
            <Select name="leaveTypeId" defaultValue={data.types.find((t) => t.code === "casual")?.id ?? data.types[0]?.id}>
              {data.types.map((t) => {
                const b = data.balances.find((x) => x.leaveTypeId === t.id);
                return <option key={t.id} value={t.id}>{t.name}{b && t.paid ? ` · ${b.remaining} left` : ""}</option>;
              })}
            </Select>
          </Field>
          {kind === "full_day" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required><Input type="date" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="To" required><Input type="date" name="endDate" min={start} defaultValue={start} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required><Input type="date" name="startDate" defaultValue={data.today} /></Field>
              <Field label="Half">
                <Select name="half" defaultValue="first">
                  <option value="first">First half</option>
                  <option value="second">Second half</option>
                </Select>
              </Field>
            </div>
          )}
          <Field label="Reason" required><Textarea name="reason" rows={3} maxLength={1000} /></Field>
          <Field label="Attachment (optional)" hint="e.g. a medical certificate. PDF or image, max 10 MB.">
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Send request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeavePage({ initial, openNew }: { initial: LeavePageData; openNew?: boolean }) {
  const qc = useQueryClient();
  const { data = initial } = useServerQuery(["leave"], () => actions.leave.page.orThrow(), initial);
  const reviewer = data.mode === "reviewer";
  const [kind, setKind] = useState<Kind>("full_day");
  const [filter, setFilter] = useState<StatusFilter>(reviewer ? "pending" : "all");
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(!!openNew && !reviewer);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const source = reviewer ? data.requests : data.mine;
  const ofKind = source.filter((r) => r.kind === kind);
  const tiles = useMemo(
    () => ({
      pending: ofKind.filter((r) => r.status === "pending").length,
      approved: ofKind.filter((r) => r.status === "approved").length,
      rejected: ofKind.filter((r) => r.status === "rejected").length,
      total: ofKind.length,
    }),
    [ofKind],
  );
  const shown = ofKind.filter((r) => filter === "all" || r.status === filter);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["leave"] });
    void qc.invalidateQueries({ queryKey: ["shell"] });
  };

  async function decide(id: string, decision: "approve" | "reject", reviewNote?: string) {
    if (decision === "reject" && reviewNote === undefined) {
      setNote("");
      return setRejecting(id);
    }
    setBusy(true);
    const { error } = await actions.leave.review({ ids: [id], decision, note: reviewNote || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(decision === "approve" ? "Approved · added to calendar and attendance" : "Rejected");
    refresh();
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this request?")) return;
    setBusy(true);
    const { error } = await actions.leave.cancel({ id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request cancelled");
    refresh();
  }

  return (
    <div className="grid gap-6">
      {!reviewer && (
        <Card>
          <CardHeader
            title="Your leave balance"
            description={`${data.today.slice(0, 4)} · accrued to date`}
            actions={<Button onClick={() => setRequestOpen(true)}><Plus aria-hidden /> Request leave</Button>}
          />
          <CardBody className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.balances.map((b) => (
              <div key={b.leaveTypeId} className="rounded-xl border border-border p-3">
                <p className="eyebrow">{b.name}</p>
                <p className="tabular mt-1 text-2xl font-semibold">{b.paid ? b.remaining : b.used}<span className="text-sm font-normal text-muted">{b.paid ? ` / ${b.accrued + b.carriedOver}` : " used"}</span></p>
                <p className="text-xs text-muted">{b.paid ? `${b.used} used` : "Unpaid"}{b.pending ? ` · ${b.pending} pending` : ""}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList>
          <TabsTrigger value="full_day" count={source.filter((r) => r.kind === "full_day" && r.status === "pending").length}>Full-day leave</TabsTrigger>
          <TabsTrigger value="half_day" count={source.filter((r) => r.kind === "half_day" && r.status === "pending").length}>Half-day requests</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pending" value={tiles.pending} icon={Clock} tone="warning" />
        <StatTile label="Approved" value={tiles.approved} icon={CheckCircle2} tone="success" />
        <StatTile label="Rejected" value={tiles.rejected} icon={XCircle} tone="danger" />
        <StatTile label="Total" value={tiles.total} icon={ListChecks} tone="neutral" />
      </div>

      {reviewer && (
        <p className="flex items-start gap-2 rounded-2xl border border-border bg-info-soft px-4 py-3 text-sm text-info-text">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Self-service leave forms are hidden for managers and organization owners. Your own leave is not tracked here.
        </p>
      )}

      <Card>
        <CardHeader
          title={reviewer ? "Workspace requests" : "Your requests"}
          description={reviewer ? "Approved leave appears on the calendar and marks attendance as On leave." : undefined}
          actions={
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn("rounded-full border px-3 py-1 text-sm capitalize transition-colors", filter === f ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2")}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />
        <CardBody>
          {shown.length === 0 ? (
            <EmptyState
              icon={kind === "half_day" ? CalendarDays : Plane}
              title={`No ${filter === "all" ? "" : filter + " "}${kind === "half_day" ? "half-day requests" : "leave requests"}`}
              description={reviewer ? "New requests appear here and in the Inbox." : "Use Request leave to ask for time off."}
              action={!reviewer ? <Button size="sm" onClick={() => setRequestOpen(true)}><Plus aria-hidden /> Request leave</Button> : undefined}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {shown.map((r) => (
                <li key={r.id}>
                  <RequestCard r={r} tz={data.timezone} reviewer={reviewer} onDecide={decide} onCancel={cancel} busy={busy} />
                  {r.attachmentFileId && <Badge tone="outline" className="mt-1"><Paperclip aria-hidden /> Attachment on file</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {!reviewer && <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} data={data} defaultKind={kind} />}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent title="Reject leave request" description="The reason is sent to the requester.">
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); const id = rejecting!; setRejecting(null); void decide(id, "reject", note); }}>
            <Field label="Reason (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button type="submit" variant="danger">Reject</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default withQuery(LeavePage);
