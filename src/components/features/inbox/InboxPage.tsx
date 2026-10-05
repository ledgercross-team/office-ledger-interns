import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCheck, ExternalLink, Filter, Inbox, Keyboard, X } from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { InboxItem } from "@/lib/queries/inbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriorityChip } from "@/components/ui/status";
import {
  FilterTabs as Tabs,
  FilterTabsList as TabsList,
  FilterTab as TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/misc";
import { Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/layout/StatTile";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Item = InboxItem & { href: string };
type Tab = "decisions" | "reviews" | "exceptions";

const KIND_LABEL: Record<string, string> = {
  join: "Join request",
  leave: "Leave",
  half_day: "Half-day",
  holiday_add: "Holiday proposal",
  holiday_remove: "Holiday removal",
  attendance: "Attendance",
  correction: "Correction",
  complaint: "Issue",
  missing_checkout: "Missing checkout",
  absent: "Absence",
  overtime: "Overtime",
  anomaly: "Short day",
};

/** Button wording per kind: exceptions are acknowledged/flagged; issues are picked up/closed. */
function verbs(kind: string) {
  if (["missing_checkout", "absent", "overtime", "anomaly"].includes(kind))
    return { approve: "Acknowledge", reject: "Flag" };
  if (kind === "complaint") return { approve: "Start review", reject: "Close" };
  return { approve: "Approve", reject: "Reject" };
}

function age(created: string) {
  const ms = Date.now() - new Date(created).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return { label: "just now", tone: "neutral" as const };
  if (h < 24) return { label: `waiting ${h}h`, tone: "neutral" as const };
  const days = Math.floor(h / 24);
  return {
    label: `waiting ${days}d`,
    tone: days >= 3 ? ("danger" as const) : days >= 1 ? ("warning" as const) : ("neutral" as const),
  };
}

function metaLine(i: Item) {
  const m = i.meta as Record<string, string | number | null>;
  if (i.kind === "leave" || i.kind === "half_day") {
    const range =
      m.startDate === m.endDate
        ? fmtDate(String(m.startDate))
        : `${fmtDate(String(m.startDate))} → ${fmtDate(String(m.endDate))}`;
    return `${m.type ? `${m.type} · ` : ""}${range}${i.kind === "half_day" ? ` · ${m.half} half` : ` · ${m.days} day(s)`}`;
  }
  if (m.date) return fmtDate(String(m.date), "en-US", { weekday: "short" });
  if (i.kind === "join" && m.email) return String(m.email);
  if (i.kind === "complaint") return `${m.category} · ${m.severity} severity`;
  return null;
}

function InboxPage({
  initial,
  initialTab,
  focus,
}: {
  initial: Item[];
  initialTab?: Tab;
  focus?: string | null;
}) {
  const qc = useQueryClient();
  const { data: raw = initial } = useServerQuery(["inbox"], () => actions.inbox.list.orThrow(), initial);
  const data = raw as Item[];
  const items = useMemo(() => data.map((i) => ({ ...i, href: i.href ?? hrefFor(i) })), [data]);
  const focusTab = focus ? items.find((i) => i.item_id === focus)?.tab : undefined;
  const [tab, setTab] = useState<Tab>(focusTab ?? initialTab ?? "decisions");
  const [kind, setKind] = useState("");
  const [dept, setDept] = useState("");
  const [priority, setPriority] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(focus ? [focus] : []));
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { decisions: 0, reviews: 0, exceptions: 0 };
    for (const i of items) c[i.tab]++;
    return c;
  }, [items]);
  const inTab = items.filter((i) => i.tab === tab);
  const kinds = [...new Set(inTab.map((i) => i.kind))];
  const depts = [
    ...new Map(items.filter((i) => i.department_id).map((i) => [i.department_id!, i.department!])).entries(),
  ];
  const view = inTab.filter(
    (i) =>
      (!kind || i.kind === kind) &&
      (!dept || i.department_id === dept) &&
      (!priority || i.priority === priority),
  );

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, view.length - 1)));
  }, [view.length]);

  const decide = useCallback(
    async (ids: string[], decision: "approve" | "reject", why?: string) => {
      if (!ids.length) return;
      setBusy(true);
      const { data: res, error } = await actions.inbox.decide({
        itemIds: ids,
        decision,
        reason: why || null,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      const failed = res.results.filter((r) => !r.ok);
      toast.success(
        `${decision === "approve" ? "Approved" : "Rejected"} ${res.ok} item${res.ok === 1 ? "" : "s"}`,
        {
          description: failed.length ? `${failed.length} skipped: ${failed[0]!.message}` : undefined,
        },
      );
      setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))));
      // optimistic removal; the server event refreshes everything else
      qc.setQueryData<Item[]>(["inbox"], (old) =>
        old?.filter((i) => !res.results.some((r) => r.ok && r.itemId === i.item_id)),
      );
      void qc.invalidateQueries({ queryKey: ["shell"] });
    },
    [qc],
  );

  const openReject = (ids: string[]) => {
    setReason("");
    setRejecting(ids);
  };

  // Keyboard triage: J/K move, X select, A approve, R reject.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        rejecting ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.isContentEditable
      )
        return;
      const current = view[cursor];
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        e.preventDefault();
        const next = Math.max(0, Math.min(view.length - 1, cursor + (key === "j" ? 1 : -1)));
        setCursor(next);
        listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-card]")[next]?.focus();
      } else if (key === "x" && current) {
        e.preventDefault();
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(current.item_id)) n.delete(current.item_id);
          else n.add(current.item_id);
          return n;
        });
      } else if (key === "a" && current) {
        e.preventDefault();
        void decide(selected.size ? [...selected] : [current.item_id], "approve");
      } else if (key === "r" && current) {
        e.preventDefault();
        openReject(selected.size ? [...selected] : [current.item_id]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, cursor, selected, decide, rejecting]);

  useEffect(() => {
    if (focus)
      listRef.current
        ?.querySelector<HTMLElement>(`[data-item="${CSS.escape(focus)}"]`)
        ?.scrollIntoView({ block: "center" });
  }, [focus]);

  const allSelected = view.length > 0 && view.every((i) => selected.has(i.item_id));
  const filtersOn = kind || dept || priority;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as Tab);
            setKind("");
            setCursor(0);
          }}
        >
          <TabsList>
            <TabsTrigger value="decisions" count={counts.decisions}>
              Decisions
            </TabsTrigger>
            <TabsTrigger value="reviews" count={counts.reviews}>
              Reviews
            </TabsTrigger>
            <TabsTrigger value="exceptions" count={counts.exceptions}>
              Exceptions
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="text-muted size-4" aria-hidden />
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 w-auto"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </Select>
          <Select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="h-9 w-auto"
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {depts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 w-auto"
            aria-label="Filter by priority"
          >
            <option value="">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          {filtersOn && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setKind("");
                setDept("");
                setPriority("");
              }}
            >
              <X aria-hidden /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="border-border bg-surface/95 sticky top-14 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 backdrop-blur">
        <Checkbox
          checked={allSelected ? true : selected.size ? "indeterminate" : false}
          onCheckedChange={(v) => setSelected(v ? new Set(view.map((i) => i.item_id)) : new Set())}
          aria-label="Select all in view"
        />
        <span className="tabular text-sm font-medium">{selected.size} selected</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelected(new Set(view.map((i) => i.item_id)))}
          disabled={!view.length}
        >
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={!selected.size}>
          Clear
        </Button>
        <span className="ms-auto flex gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => decide([...selected], "approve")}
            disabled={!selected.size}
            loading={busy}
          >
            <CheckCheck aria-hidden /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openReject([...selected])}
            disabled={!selected.size || busy}
          >
            <X aria-hidden /> Reject
          </Button>
        </span>
        <span className="text-muted hidden w-full items-center gap-1.5 text-xs md:flex">
          <Keyboard className="size-3.5" aria-hidden /> <kbd>J</kbd>/<kbd>K</kbd> move · <kbd>X</kbd> select ·{" "}
          <kbd>A</kbd> approve · <kbd>R</kbd> reject
        </span>
      </div>

      {view.length === 0 ? (
        <div className="border-border bg-surface rounded-2xl border">
          <EmptyState
            icon={Inbox}
            title={filtersOn ? "Nothing matches these filters" : "All clear"}
            description={
              filtersOn
                ? "Try clearing a filter."
                : "New requests will appear here as soon as they're submitted."
            }
          />
        </div>
      ) : (
        <ul ref={listRef} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={`${tab} items`}>
          {view.map((i, idx) => {
            const v = verbs(i.kind);
            const a = age(i.created_at);
            const sel = selected.has(i.item_id);
            const meta = metaLine(i);
            return (
              <li key={i.item_id} data-item={i.item_id}>
                <article
                  data-inbox-card
                  tabIndex={0}
                  onFocus={() => setCursor(idx)}
                  aria-label={`${i.title} from ${i.requester_name ?? "unknown"}`}
                  className={cn(
                    "bg-surface shadow-card flex h-full flex-col gap-3 rounded-2xl border p-4 transition-colors duration-150 outline-none",
                    sel ? "border-primary bg-primary-soft" : "border-border",
                    cursor === idx && "ring-ring ring-2",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={sel}
                      onCheckedChange={(c) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (c) n.add(i.item_id);
                          else n.delete(i.item_id);
                          return n;
                        })
                      }
                      aria-label={`Select ${i.title}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="font-semibold">{i.title}</h2>
                      </div>
                      <p className="text-muted truncate text-sm">
                        {[i.requester_name, i.employee_code, i.department].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <PriorityChip priority={i.priority} />
                  </div>
                  {meta && <p className="text-sm font-medium">{meta}</p>}
                  {i.reason && <p className="text-muted line-clamp-3 text-sm">{i.reason}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone={a.tone}>{a.label}</Badge>
                    <span className="ms-auto flex gap-1.5">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => decide([i.item_id], "approve")}
                        disabled={busy}
                      >
                        <Check aria-hidden /> {v.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReject([i.item_id])}
                        disabled={busy}
                      >
                        {v.reject}
                      </Button>
                      <Button asChild size="icon-sm" variant="ghost">
                        <a href={i.href} aria-label="Open source record" title="Open source">
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent
          title={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length} items` : "Reject request"}
          description="Optionally tell the requester why. They'll see this message in their notification."
        >
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ids = rejecting ?? [];
              setRejecting(null);
              await decide(ids, "reject", reason);
            }}
          >
            <Field label="Reason (optional)">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger">
                Reject
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function hrefFor(i: InboxItem) {
  switch (i.kind) {
    case "join":
      return "/app/employees?tab=pending";
    case "leave":
    case "half_day":
      return "/app/leave";
    case "holiday_add":
    case "holiday_remove":
      return `/app/calendar?tab=holidays&date=${String(i.meta.date ?? "")}`;
    case "complaint":
      return `/app/complaints?id=${i.source_id}`;
    default:
      return i.requester_id ? `/app/employees/${i.requester_id}` : "/app/attendance";
  }
}

export default withQuery(InboxPage);
