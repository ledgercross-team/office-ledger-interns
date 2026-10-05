import { useEffect, useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleDot,
  EyeOff,
  Inbox,
  ListChecks,
  MessageSquarePlus,
  Paperclip,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { ComplaintsData } from "@/lib/queries/complaints";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { PriorityChip } from "@/components/ui/status";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Item = ComplaintsData["items"][number];
const STATUS_TONE: Record<Item["status"], Tone> = { new: "info", reviewing: "violet", resolved: "success" };
const STEPS: Item["status"][] = ["new", "reviewing", "resolved"];

function StatusSteps({ status }: { status: Item["status"] }) {
  const idx = STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label={`Status: ${status}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 capitalize",
              i <= idx ? "bg-primary-soft text-primary font-medium" : "bg-surface-2 text-muted",
            )}
            aria-current={i === idx ? "step" : undefined}
          >
            {s}
          </span>
          {i < STEPS.length - 1 && <span className="bg-border h-px w-3" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function Timeline({ item, tz }: { item: Item; tz: string }) {
  const label = (e: Item["events"][number]) => {
    if (e.kind === "created") return "Issue submitted";
    if (e.kind === "status_change") return `Moved ${e.fromStatus ?? ""} → ${e.toStatus}`;
    if (e.kind === "assigned") return e.body ?? "Assignee changed";
    if (e.kind === "note") return "Internal note";
    return "Message to submitter";
  };
  return (
    <ol className="border-border relative grid gap-4 border-s ps-5">
      {item.events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              "border-surface absolute -start-[1.6rem] top-1 size-2.5 rounded-full border-2",
              e.internal ? "bg-warning" : "bg-primary",
            )}
            aria-hidden
          />
          <p className="text-sm font-medium">
            {label(e)} {e.internal && <Badge tone="warning">Internal</Badge>}
          </p>
          {e.body && e.kind !== "assigned" && (
            <p className="text-muted text-sm whitespace-pre-wrap">{e.body}</p>
          )}
          <p className="text-muted text-xs">
            {fmtDateTime(e.createdAt, tz)}
            {e.actorName ? ` · ${e.actorName}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function SubmitDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: string[];
}) {
  const qc = useQueryClient();
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    const { data, error } = await actions.complaints.submit({
      category: f.category ?? "Other",
      subject: f.subject ?? "",
      description: f.description ?? "",
      severity: (f.severity as "low" | "medium" | "high" | "critical") ?? "medium",
      anonymous: anon,
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    const file = fileRef.current?.files?.[0];
    if (file) {
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", "complaint");
      form.set("entityId", data.id);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) toast.error("The attachment couldn't be uploaded.");
    }
    setBusy(false);
    toast.success("Issue submitted. You'll be notified as it progresses.");
    onOpenChange(false);
    setAnon(false);
    void qc.invalidateQueries({ queryKey: ["complaints"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Raise an issue"
        description="Owners and managers review issues. Choose anonymous to hide your name from managers."
      >
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select name="category" defaultValue={categories[0]}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select name="severity" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>
          </div>
          <Field label="Subject" required>
            <Input name="subject" maxLength={140} />
          </Field>
          <Field label="Description" required hint="What happened, when, and how it affects you or the team.">
            <Textarea name="description" rows={5} maxLength={5000} />
          </Field>
          <Field label="Attachment (optional)">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              className="file:bg-surface-2 block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm"
            />
          </Field>
          <label className="border-border flex items-start justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-medium">
                <EyeOff className="text-muted size-4" aria-hidden /> Submit anonymously
              </span>
              <span className="text-muted text-xs">
                Managers won't see your name. Depending on workspace policy, the owner may.
              </span>
            </span>
            <Switch checked={anon} onCheckedChange={setAnon} aria-label="Submit anonymously" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Submit issue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetailSheet({
  item,
  data,
  tz,
  onClose,
}: {
  item: Item | null;
  data: ComplaintsData;
  tz: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(true);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setNote("");
    setResolution(item?.resolutionMessage ?? "");
    setInternal(true);
  }, [item?.id, item?.resolutionMessage]);
  if (!item) return null;
  const processor = data.processor && item.submitterId !== data.me;
  async function update(
    key: string,
    input: Omit<Parameters<typeof actions.complaints.update>[0], "id">,
    ok: string,
  ) {
    setBusy(key);
    const { error } = await actions.complaints.update({ id: item!.id, ...input });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(ok);
    void qc.invalidateQueries({ queryKey: ["complaints"] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="max-w-lg"
        title={item.subject}
        description={`${item.category} · submitted ${fmtDateTime(item.createdAt, tz)}`}
      >
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusSteps status={item.status} />
            <PriorityChip priority={item.severity} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted text-xs">Submitted by</dt>
              <dd className="flex items-center gap-1">
                {item.anonymous && <EyeOff className="text-muted size-3.5" aria-label="Anonymous" />}
                {item.submitterName ?? "Former member"}
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Assignee</dt>
              <dd>
                {processor ? (
                  <Select
                    className="h-8"
                    value={item.assigneeId ?? ""}
                    onChange={(e) =>
                      update("assign", { assigneeId: e.target.value || null }, "Assignee updated")
                    }
                    aria-label="Assignee"
                  >
                    <option value="">Unassigned</option>
                    {data.processors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  (item.assigneeName ?? "Unassigned")
                )}
              </dd>
            </div>
          </dl>
          <p className="bg-surface-2 rounded-xl p-3 text-sm whitespace-pre-wrap">{item.description}</p>
          {item.attachments.length > 0 && (
            <ul className="grid gap-1">
              {item.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener"
                    className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                  >
                    <Paperclip className="size-3.5" aria-hidden /> {a.filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {item.status === "resolved" && item.resolutionMessage && (
            <div className="bg-success-soft rounded-xl border border-[color-mix(in_oklch,var(--success)_30%,var(--border))] p-3 text-sm">
              <p className="text-success-text font-medium">Resolution</p>
              <p className="whitespace-pre-wrap">{item.resolutionMessage}</p>
            </div>
          )}

          {processor && (
            <section className="border-border grid gap-3 rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Update status</h3>
              <div className="flex flex-wrap gap-2">
                {item.status === "new" && (
                  <Button
                    size="sm"
                    loading={busy === "reviewing"}
                    onClick={() => update("reviewing", { status: "reviewing" }, "Moved to reviewing")}
                  >
                    Start review
                  </Button>
                )}
                {item.status === "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === "reopen"}
                    onClick={() => update("reopen", { status: "reviewing" }, "Reopened")}
                  >
                    Reopen
                  </Button>
                )}
              </div>
              {item.status !== "resolved" && (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void update(
                      "resolve",
                      { status: "resolved", resolutionMessage: resolution },
                      "Resolved and submitter notified",
                    );
                  }}
                >
                  <Field label="Resolution message to submitter">
                    <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} />
                  </Field>
                  <Button
                    type="submit"
                    variant="success"
                    size="sm"
                    className="justify-self-start"
                    loading={busy === "resolve"}
                    disabled={!resolution.trim()}
                  >
                    <CheckCircle2 aria-hidden /> Resolve
                  </Button>
                </form>
              )}
            </section>
          )}

          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Status history</h3>
            <Timeline item={item} tz={tz} />
          </section>

          {processor && (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim())
                  void update("note", { note, internal }, internal ? "Note added" : "Message sent").then(() =>
                    setNote(""),
                  );
              }}
            >
              <Field
                label={internal ? "Internal note (not visible to the submitter)" : "Message to the submitter"}
              >
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!internal}
                    onCheckedChange={(v) => setInternal(!v)}
                    aria-label="Visible to submitter"
                  />{" "}
                  Visible to submitter
                </label>
                <Button type="submit" size="sm" loading={busy === "note"} disabled={!note.trim()}>
                  Add
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}

function ComplaintsPage({
  initial,
  tz,
  openId,
}: {
  initial: ComplaintsData;
  tz: string;
  openId?: string | null;
}) {
  const { data = initial } = useServerQuery(["complaints"], () => actions.complaints.page.orThrow(), initial);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (openId) setSelected(openId); // open deep-linked issue after hydration
  }, [openId]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const counts = useMemo(
    () => ({
      new: data.items.filter((i) => i.status === "new").length,
      reviewing: data.items.filter((i) => i.status === "reviewing").length,
      resolved: data.items.filter((i) => i.status === "resolved").length,
    }),
    [data.items],
  );
  const shown = data.items.filter(
    (i) =>
      (filter === "all" || (filter === "open" ? i.status !== "resolved" : i.status === "resolved")) &&
      (!q || `${i.subject} ${i.category} ${i.submitterName}`.toLowerCase().includes(q.toLowerCase())),
  );
  const current = data.items.find((i) => i.id === selected) ?? null;

  return (
    <div className="grid gap-6">
      {data.processor && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="New" value={counts.new} icon={Sparkles} tone="info" />
          <StatTile label="Reviewing" value={counts.reviewing} icon={CircleDot} tone="violet" />
          <StatTile label="Resolved" value={counts.resolved} icon={CheckCircle2} tone="success" />
          <StatTile label="Total" value={data.items.length} icon={ListChecks} />
        </div>
      )}
      <Card>
        <CardHeader
          title={data.processor ? "Issue tracker" : "Your issues"}
          description={
            data.processor
              ? "Move items from new → reviewing → resolved."
              : "Track the progress of issues you've raised."
          }
          actions={
            data.canSubmit && (
              <Button onClick={() => setSubmitOpen(true)}>
                <MessageSquarePlus aria-hidden /> Raise an issue
              </Button>
            )
          }
        />
        <CardBody className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList>
                <TabsTrigger value="open" count={counts.new + counts.reviewing}>
                  Open issues
                </TabsTrigger>
                <TabsTrigger value="resolved" count={counts.resolved}>
                  Resolved
                </TabsTrigger>
                <TabsTrigger value="all" count={data.items.length}>
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative ms-auto min-w-52">
              <Search
                className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search issues…"
                className="h-9 ps-9"
                aria-label="Search issues"
              />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={filter === "open" ? Inbox : ShieldAlert}
              title={filter === "open" ? "No open issues" : "Nothing here"}
              description={
                filter === "open"
                  ? data.processor
                    ? "New reports will appear here immediately."
                    : "Raise an issue if something needs attention."
                  : undefined
              }
            />
          ) : (
            <ul className="grid gap-2">
              {shown.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(i.id)}
                    className="border-border hover:bg-surface-2 flex w-full flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.subject}</span>
                      <span className="text-muted flex flex-wrap items-center gap-x-2 text-xs">
                        <span>{i.category}</span>·
                        <span className="inline-flex items-center gap-1">
                          {i.anonymous && <EyeOff className="size-3" aria-label="Anonymous" />}
                          {i.submitterName}
                        </span>
                        ·<span>{fmtDateTime(i.createdAt, tz)}</span>
                        {i.assigneeName && (
                          <>
                            ·<span>Assigned to {i.assigneeName}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <PriorityChip priority={i.severity} />
                    <Badge tone={STATUS_TONE[i.status]} className="capitalize">
                      {i.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <SubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} categories={data.categories} />
      <DetailSheet item={current} data={data} tz={tz} onClose={() => setSelected(null)} />
    </div>
  );
}

export default withQuery(ComplaintsPage);
