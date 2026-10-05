import { useEffect, useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckSquare,
  KanbanSquare,
  List,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { TaskBoardData, TaskCard, TaskDetail } from "@/lib/queries/tasks";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriorityChip } from "@/components/ui/status";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, Checkbox } from "@/components/ui/misc";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/StatTile";
import { diffDays, fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Status = TaskCard["status"];
const COLUMNS: { id: Status; label: string; dot: string }[] = [
  { id: "todo", label: "To do", dot: "bg-muted" },
  { id: "in_progress", label: "In progress", dot: "bg-info" },
  { id: "blocked", label: "Blocked", dot: "bg-danger" },
  { id: "done", label: "Done", dot: "bg-success" },
];
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

function DueBadge({ due, today, done }: { due: string | null; today: string; done: boolean }) {
  if (!due) return null;
  const d = diffDays(due, today);
  const tone = done ? "neutral" : d < 0 ? "danger" : d <= 2 ? "warning" : "neutral";
  const label = done
    ? fmtDate(due, "en-US", { year: undefined })
    : d < 0
      ? `Overdue ${-d}d`
      : d === 0
        ? "Due today"
        : d === 1
          ? "Due tomorrow"
          : fmtDate(due, "en-US", { year: undefined });
  return (
    <Badge tone={tone}>
      <CalendarClock aria-hidden /> {label}
    </Badge>
  );
}

function TaskCardView({
  t,
  today,
  onOpen,
  dragging,
}: {
  t: TaskCard;
  today: string;
  onOpen?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border bg-surface shadow-card hover:shadow-pop grid gap-2 rounded-xl border p-3 text-start transition-shadow duration-150",
        dragging && "shadow-pop ring-primary rotate-1 ring-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="hover:text-primary min-h-6 py-0.5 text-start text-sm leading-snug font-medium"
          >
            {t.title}
          </button>
        ) : (
          <span className="py-0.5 text-sm leading-snug font-medium">{t.title}</span>
        )}
        <PriorityChip priority={t.priority} />
      </div>
      {(t.labels.length > 0 || t.department) && (
        <div className="flex flex-wrap gap-1">
          {t.department && <Badge tone="info">{t.department}</Badge>}
          {t.labels.map((l) => (
            <Badge key={l} tone="outline">
              #{l}
            </Badge>
          ))}
        </div>
      )}
      <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
        <DueBadge due={t.dueDate} today={today} done={t.status === "done"} />
        {t.checklistTotal > 0 && (
          <span className="tabular inline-flex items-center gap-1">
            <CheckSquare className="size-3.5" aria-hidden />
            {t.checklistDone}/{t.checklistTotal}
          </span>
        )}
        {t.comments > 0 && (
          <span className="tabular inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden />
            {t.comments}
          </span>
        )}
        {t.attachments > 0 && (
          <span className="tabular inline-flex items-center gap-1">
            <Paperclip className="size-3.5" aria-hidden />
            {t.attachments}
          </span>
        )}
        <span className="ms-auto flex -space-x-2 rtl:space-x-reverse">
          {t.assignees.slice(0, 3).map((a) => (
            <Avatar key={a.id} name={a.name} image={a.image} size="sm" className="ring-surface ring-2" />
          ))}
          {t.assignees.length > 3 && (
            <span className="tabular bg-surface-2 ring-surface grid size-7 place-items-center rounded-full text-[0.65rem] ring-2">
              +{t.assignees.length - 3}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SortableCard({ t, today, onOpen }: { t: TaskCard; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
    disabled: !t.canEdit,
    data: { status: t.status },
  });
  return (
    <li>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "[&:hover_span]:text-primary cursor-pointer touch-manipulation rounded-xl",
          isDragging && "opacity-40",
        )}
        {...attributes}
        {...listeners}
        aria-roledescription="Draggable task"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
          listeners?.onKeyDown?.(e);
        }}
      >
        <TaskCardView t={t} today={today} />
      </div>
    </li>
  );
}

function Column({
  col,
  items,
  today,
  onOpen,
  onAdd,
}: {
  col: (typeof COLUMNS)[number];
  items: TaskCard[];
  today: string;
  onOpen: (id: string) => void;
  onAdd?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}`, data: { status: col.id } });
  return (
    <section
      ref={setNodeRef}
      aria-label={col.label}
      className={cn(
        "bg-surface-2/70 flex min-w-68 flex-1 flex-col rounded-2xl p-2 transition-colors xl:min-w-0",
        isOver && "bg-primary-soft",
      )}
    >
      <header className="flex items-center gap-2 px-2 py-2">
        <span className={cn("size-2 rounded-full", col.dot)} aria-hidden />
        <h3 className="text-sm font-semibold">{col.label}</h3>
        <span className="tabular bg-surface text-muted rounded-full px-2 text-xs">{items.length}</span>
        {onAdd && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="ms-auto"
            onClick={onAdd}
            aria-label={`Add task to ${col.label}`}
          >
            <Plus aria-hidden />
          </Button>
        )}
      </header>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="grid min-h-24 content-start gap-2 p-1">
          {items.map((t) => (
            <SortableCard key={t.id} t={t} today={today} onOpen={() => onOpen(t.id)} />
          ))}
          {!items.length && (
            <li className="border-border text-muted grid h-20 place-items-center rounded-xl border border-dashed text-xs">
              Drop tasks here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

// ---- Task form (new + edit) ------------------------------------------------------------------
interface FormState {
  title: string;
  description: string;
  status: Status;
  priority: TaskCard["priority"];
  dueDate: string;
  labels: string;
  departmentId: string;
  assigneeIds: string[];
}

function AssigneePicker({
  members,
  value,
  onChange,
  disabled,
}: {
  members: TaskBoardData["members"];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => {
          const m = members.find((x) => x.id === id);
          return m ? (
            <span
              key={id}
              className="bg-surface-2 inline-flex items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-1 text-sm"
            >
              <Avatar name={m.name} image={m.image} size="sm" /> {m.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="hover:bg-surface rounded-full p-0.5"
                  aria-label={`Remove ${m.name}`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ) : null;
        })}
        {!value.length && <span className="text-muted text-sm">Unassigned</span>}
      </div>
      {!disabled && (
        <>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Add people…"
            aria-label="Search people"
          />
          {q && (
            <ul className="border-border max-h-40 overflow-auto rounded-xl border">
              {shown.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-1.5 text-sm"
                    onClick={() => {
                      if (!value.includes(m.id)) onChange([...value, m.id]);
                      setQ("");
                    }}
                  >
                    <Avatar name={m.name} image={m.image} size="sm" /> {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TaskFields({
  form,
  set,
  data,
  canAssign,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
  data: TaskBoardData;
  canAssign: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Title" required>
        <Input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} />
      </Field>
      <Field label="Description" hint="Markdown supported.">
        <Textarea rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select
            value={form.priority}
            onChange={(e) => set({ priority: e.target.value as FormState["priority"] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label="Department">
          <Select value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">—</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Labels" hint="Comma separated.">
          <Input
            value={form.labels}
            onChange={(e) => set({ labels: e.target.value })}
            placeholder="bug, release"
          />
        </Field>
      </div>
      <Field label="Assignees" hint={canAssign ? undefined : "Tasks you create are assigned to you."}>
        <AssigneePicker
          members={data.members}
          value={form.assigneeIds}
          onChange={(v) => set({ assigneeIds: v })}
          disabled={!canAssign}
        />
      </Field>
    </div>
  );
}

const labelsOf = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function NewTaskDialog({
  open,
  onOpenChange,
  data,
  status,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: TaskBoardData;
  status: Status;
}) {
  const qc = useQueryClient();
  const blank = (): FormState => ({
    title: "",
    description: "",
    status,
    priority: "medium",
    dueDate: "",
    labels: "",
    departmentId: "",
    assigneeIds: data.canManage ? [] : [data.me],
  });
  const [form, setForm] = useState<FormState>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 2) return toast.error("Add a title.");
    setBusy(true);
    const { error } = await actions.tasks.create({
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
      labels: labelsOf(form.labels),
      departmentId: form.departmentId || null,
      assigneeIds: form.assigneeIds,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Task created");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New task" className="max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <TaskFields
            form={form}
            set={(p) => setForm((f) => ({ ...f, ...p }))}
            data={data}
            canAssign={data.canManage}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MentionBox({
  members,
  onSubmit,
}: {
  members: TaskBoardData["members"];
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const token = /@([\p{L}][\p{L} '-]{0,30})$/u.exec(
    body.slice(0, ref.current?.selectionStart ?? body.length),
  )?.[1];
  const suggestions = token
    ? members.filter((m) => m.name.toLowerCase().startsWith(token.toLowerCase())).slice(0, 5)
    : [];
  function pick(name: string) {
    const caret = ref.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@[\p{L}][\p{L} '-]{0,30}$/u, `@[${name}] `);
    setBody(before + body.slice(caret));
    ref.current?.focus();
  }
  return (
    <form
      className="relative grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        if (await onSubmit(body)) setBody("");
        setBusy(false);
      }}
    >
      <Textarea
        ref={ref}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment… type @ to mention someone"
        aria-label="Comment"
      />
      {suggestions.length > 0 && (
        <ul
          className="border-border bg-surface shadow-pop absolute start-0 bottom-full z-10 mb-1 w-64 rounded-xl border p-1"
          role="listbox"
          aria-label="Mention suggestions"
        >
          {suggestions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(m.name)}
                className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
              >
                <Avatar name={m.name} image={m.image} size="sm" /> {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button type="submit" size="sm" className="justify-self-end" loading={busy} disabled={!body.trim()}>
        Comment
      </Button>
    </form>
  );
}

function TaskSheet({ id, onClose, data }: { id: string | null; onClose: () => void; data: TaskBoardData }) {
  const qc = useQueryClient();
  const { data: t, isLoading } = useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => actions.tasks.detail.orThrow({ id: id! }),
    enabled: !!id,
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (t)
      setForm({
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ?? "",
        labels: t.labels.join(", "),
        departmentId: t.departmentId ?? "",
        assigneeIds: t.assigneeIds,
      });
  }, [t]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  async function save() {
    if (!t || !form) return;
    setBusy(true);
    const { error } = await actions.tasks.update({
      id: t.id,
      title: form.title,
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate || null,
      labels: labelsOf(form.labels),
      departmentId: form.departmentId || null,
      assigneeIds: t.canManage ? form.assigneeIds : undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Task saved");
    refresh();
  }
  async function checklist(input: Parameters<typeof actions.tasks.checklist>[0]) {
    const { error } = await actions.tasks.checklist(input);
    if (error) toast.error(error.message);
    refresh();
  }
  async function attach(file?: File) {
    if (!file || !t) return;
    const form = new FormData();
    form.set("file", file);
    form.set("entityType", "task");
    form.set("entityId", t.id);
    const res = await fetch("/api/files", { method: "POST", body: form });
    if (!res.ok)
      toast.error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Upload failed");
    else toast.success("Attached");
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }
  const detail = t as TaskDetail | undefined;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="max-w-xl"
        title={detail?.title ?? "Task"}
        description={
          detail
            ? `Created ${fmtDate(detail.createdAt)} · ${COLUMNS.find((c) => c.id === detail.status)?.label}`
            : undefined
        }
        footer={
          detail && (
            <>
              {detail.canManage && (
                <Button
                  variant="ghost"
                  className="me-auto"
                  onClick={async () => {
                    await actions.tasks.archive({ id: detail.id, archived: !detail.archivedAt });
                    toast.success(detail.archivedAt ? "Task restored" : "Task archived");
                    refresh();
                    onClose();
                  }}
                >
                  {detail.archivedAt ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}{" "}
                  {detail.archivedAt ? "Restore" : "Archive"}
                </Button>
              )}
              {detail.canEdit && (
                <Button onClick={save} loading={busy}>
                  Save changes
                </Button>
              )}
            </>
          )
        }
      >
        {isLoading || !detail || !form ? (
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6">
            {detail.canEdit ? (
              <TaskFields
                form={form}
                set={(p) => setForm((f) => (f ? { ...f, ...p } : f))}
                data={data}
                canAssign={detail.canManage}
              />
            ) : (
              <div
                className="prose-sm text-sm leading-relaxed [&_li]:ms-4 [&_ul]:list-disc"
                dangerouslySetInnerHTML={{ __html: detail.descriptionHtml }}
              />
            )}

            <section className="grid gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CheckSquare className="text-muted size-4" aria-hidden /> Checklist{" "}
                <span className="tabular text-muted">
                  {detail.checklist.filter((c) => c.done).length}/{detail.checklist.length}
                </span>
              </h3>
              <ul className="grid gap-1">
                {detail.checklist.map((c) => (
                  <li
                    key={c.id}
                    className="group hover:bg-surface-2 flex items-center gap-2 rounded-lg px-1 py-1"
                  >
                    <Checkbox
                      checked={c.done}
                      disabled={!detail.canEdit}
                      onCheckedChange={(v) =>
                        checklist({ op: "toggle", taskId: detail.id, itemId: c.id, done: !!v })
                      }
                      aria-label={c.text}
                    />
                    <span className={cn("flex-1 text-sm", c.done && "text-muted line-through")}>
                      {c.text}
                    </span>
                    {detail.canEdit && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                        onClick={() => checklist({ op: "remove", taskId: detail.id, itemId: c.id })}
                        aria-label={`Remove ${c.text}`}
                      >
                        <Trash2 className="text-muted size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {detail.canEdit && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newItem.trim()) {
                      void checklist({ op: "add", taskId: detail.id, text: newItem });
                      setNewItem("");
                    }
                  }}
                >
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add an item"
                    aria-label="New checklist item"
                  />
                  <Button type="submit" variant="outline">
                    Add
                  </Button>
                </form>
              )}
            </section>

            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Paperclip className="text-muted size-4" aria-hidden /> Attachments
                </h3>
                {detail.canEdit && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                      <Upload aria-hidden /> Upload
                    </Button>
                    <input ref={fileRef} type="file" hidden onChange={(e) => attach(e.target.files?.[0])} />
                  </>
                )}
              </div>
              {detail.attachments.length === 0 ? (
                <p className="text-muted text-sm">No attachments.</p>
              ) : (
                <ul className="grid gap-1">
                  {detail.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener"
                        className="text-primary text-sm hover:underline"
                      >
                        {a.filename}
                      </a>{" "}
                      <span className="text-muted text-xs">{Math.ceil(a.size / 1024)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="grid gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="text-muted size-4" aria-hidden /> Comments
              </h3>
              <ol className="grid gap-3">
                {detail.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.author ?? "?"} image={c.image} size="sm" />
                    <div className="bg-surface-2 min-w-0 flex-1 rounded-xl px-3 py-2">
                      <p className="text-xs">
                        <span className="font-medium">{c.author ?? "Former member"}</span>{" "}
                        <span className="text-muted">
                          · {fmtDateTime(c.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}
                        </span>
                      </p>
                      <div className="text-sm [&_p]:mb-1" dangerouslySetInnerHTML={{ __html: c.html }} />
                    </div>
                  </li>
                ))}
              </ol>
              <MentionBox
                members={data.members}
                onSubmit={async (body) => {
                  const { data: res, error } = await actions.tasks.comment({ taskId: detail.id, body });
                  if (error) {
                    toast.error(error.message);
                    return false;
                  }
                  if (res.mentions)
                    toast.success(`Notified ${res.mentions} ${res.mentions === 1 ? "person" : "people"}`);
                  refresh();
                  return true;
                }}
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}

// ---- Page ----------------------------------------------------------------------------------------
function TaskboardPage({
  initial,
  openTask,
  openNew,
}: {
  initial: TaskBoardData;
  openTask?: string | null;
  openNew?: boolean;
}) {
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const key = ["tasks", archived ? "archived" : "active"];
  const { data = initial, isFetching } = useServerQuery<TaskBoardData>(
    key,
    () => actions.tasks.board.orThrow({ archived }),
    archived ? undefined : initial,
  );
  const board = data ?? initial;
  const [view, setView] = useState<"board" | "list">("board");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [label, setLabel] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newIn, setNewIn] = useState<Status | null>(null);
  useEffect(() => {
    // deep links open after hydration so SSR markup matches
    if (openTask) setOpenId(openTask);
    else if (openNew) setNewIn("todo");
  }, [openTask, openNew]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setNewIn("todo");
    window.addEventListener("ledger:new-task", open);
    return () => window.removeEventListener("ledger:new-task", open);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("task", openId);
    else url.searchParams.delete("task");
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
  }, [openId]);

  const labels = [...new Set(board.tasks.flatMap((t) => t.labels))].sort();
  const filtered = useMemo(
    () =>
      board.tasks.filter(
        (t) =>
          (!mine || t.assignees.some((a) => a.id === board.me)) &&
          (!assignee || t.assignees.some((a) => a.id === assignee)) &&
          (!priority || t.priority === priority) &&
          (!label || t.labels.includes(label)) &&
          (!q || t.title.toLowerCase().includes(q.toLowerCase())),
      ),
    [board, mine, assignee, priority, label, q],
  );
  const byCol = (s: Status) => filtered.filter((t) => t.status === s).sort((a, b) => a.position - b.position);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id));
  }
  async function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const task = board.tasks.find((t) => t.id === active.id);
    if (!task) return;
    const overId = String(over.id);
    const to: Status = overId.startsWith("col:")
      ? (overId.slice(4) as Status)
      : (board.tasks.find((t) => t.id === overId)?.status ?? task.status);
    const col = byCol(to).filter((t) => t.id !== task.id);
    let index = overId.startsWith("col:") ? col.length : col.findIndex((t) => t.id === overId);
    if (index < 0) index = col.length;
    // dropping below the hovered card when moving down within the same column
    const oldIndex = byCol(task.status).findIndex((t) => t.id === task.id);
    if (
      to === task.status &&
      !overId.startsWith("col:") &&
      oldIndex < byCol(to).findIndex((t) => t.id === overId)
    )
      index += 1;
    const prev = col[index - 1]?.position;
    const next = col[index]?.position;
    const position =
      prev !== undefined && next !== undefined
        ? (prev + next) / 2
        : prev !== undefined
          ? prev + 1
          : next !== undefined
            ? next - 1
            : 1;
    if (to === task.status && position === task.position) return;
    const snapshot = qc.getQueryData<TaskBoardData>(key);
    qc.setQueryData<TaskBoardData>(key, (old) =>
      old
        ? { ...old, tasks: old.tasks.map((t) => (t.id === task.id ? { ...t, status: to, position } : t)) }
        : old,
    );
    const { error } = await actions.tasks.move({ id: task.id, status: to, position });
    if (error) {
      qc.setQueryData(key, snapshot);
      toast.error(error.message);
    } else if (to !== task.status) toast.success(`Moved to ${COLUMNS.find((c) => c.id === to)!.label}`);
  }

  const listCols = useMemo<ColumnDef<TaskCard, unknown>[]>(
    () => [
      {
        id: "title",
        header: "Task",
        accessorFn: (t) => t.title,
        cell: ({ row }) => (
          <button
            type="button"
            className="hover:text-primary text-start font-medium"
            onClick={() => setOpenId(row.original.id)}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (t) => t.status,
        cell: ({ getValue }) => <Badge>{COLUMNS.find((c) => c.id === getValue())?.label}</Badge>,
      },
      {
        id: "priority",
        header: "Priority",
        accessorFn: (t) => PRIORITY_RANK[t.priority],
        cell: ({ row }) => <PriorityChip priority={row.original.priority} />,
        meta: { csv: (t) => t.priority },
      },
      {
        id: "due",
        header: "Due",
        accessorFn: (t) => t.dueDate ?? "9999",
        cell: ({ row }) => (
          <DueBadge due={row.original.dueDate} today={board.today} done={row.original.status === "done"} />
        ),
        meta: { csv: (t) => t.dueDate ?? "" },
      },
      { id: "assignees", header: "Assignees", accessorFn: (t) => t.assignees.map((a) => a.name).join(", ") },
      { id: "department", header: "Department", accessorFn: (t) => t.department ?? "" },
      { id: "labels", header: "Labels", accessorFn: (t) => t.labels.join(", ") },
    ],
    [board.today],
  );

  const dragging = dragId ? board.tasks.find((t) => t.id === dragId) : null;
  const activeCount = board.tasks.length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-surface-2 flex rounded-xl p-1" role="group" aria-label="Task set">
          <Button
            size="sm"
            variant={!archived ? "outline" : "ghost"}
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            Active tasks
          </Button>
          <Button
            size="sm"
            variant={archived ? "outline" : "ghost"}
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            Archived tasks
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mine ? "primary" : "outline"}
            aria-pressed={mine}
            onClick={() => setMine((m) => !m)}
          >
            <UserRound aria-hidden /> My tasks
          </Button>
          <div className="bg-surface-2 flex rounded-xl p-1" role="group" aria-label="View">
            <Button
              size="sm"
              variant={view === "board" ? "outline" : "ghost"}
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
            >
              <KanbanSquare aria-hidden /> Board
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "outline" : "ghost"}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List aria-hidden /> List
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title={view === "board" ? "Board view" : "List view"}
          description={archived ? "Archived tasks stay in history" : "Workspace tasks"}
          actions={
            <Badge tone="primary" className="tabular">
              {archived ? `${activeCount} archived` : `${activeCount} active`}
            </Badge>
          }
        />
        <CardBody className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search
                className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tasks…"
                className="ps-9"
                aria-label="Search tasks"
              />
            </div>
            <Select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-auto"
              aria-label="Assignee"
            >
              <option value="">Anyone</option>
              {board.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-auto"
              aria-label="Priority"
            >
              <option value="">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
            {labels.length > 0 && (
              <Select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-auto"
                aria-label="Label"
              >
                <option value="">Any label</option>
                {labels.map((l) => (
                  <option key={l} value={l}>
                    #{l}
                  </option>
                ))}
              </Select>
            )}
            {(q || assignee || priority || label) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setAssignee("");
                  setPriority("");
                  setLabel("");
                }}
              >
                <X aria-hidden /> Clear
              </Button>
            )}
          </div>

          {isFetching && !data ? (
            <div className="grid gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-64" />
              ))}
            </div>
          ) : board.tasks.length === 0 ? (
            <EmptyState
              icon={KanbanSquare}
              title={archived ? "No archived tasks" : "No active tasks"}
              description={
                archived ? "Archived tasks will appear here." : "Create the first task to populate the board."
              }
              action={
                !archived && (
                  <Button onClick={() => setNewIn("todo")}>
                    <Plus aria-hidden /> Create the first task
                  </Button>
                )
              }
            />
          ) : view === "list" || archived ? (
            <DataTable
              caption="Tasks"
              columns={listCols}
              data={filtered}
              csvName="tasks"
              onRowClick={(t) => setOpenId(t.id)}
              initialSort={[{ id: "priority", desc: false }]}
            />
          ) : (
            <DndContext
              id="taskboard"
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragId(null)}
              accessibility={{
                screenReaderInstructions: {
                  draggable:
                    "Press space to pick up a task, use arrow keys to move it between columns, space to drop, escape to cancel. Press Enter to open it.",
                },
              }}
            >
              <div className="-mx-1 flex scrollbar-thin gap-3 overflow-x-auto px-1 pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible">
                {COLUMNS.map((c) => (
                  <Column
                    key={c.id}
                    col={c}
                    items={byCol(c.id)}
                    today={board.today}
                    onOpen={setOpenId}
                    onAdd={() => setNewIn(c.id)}
                  />
                ))}
              </div>
              <DragOverlay>
                {dragging ? <TaskCardView t={dragging} today={board.today} dragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </CardBody>
      </Card>

      <NewTaskDialog
        open={!!newIn}
        onOpenChange={(o) => !o && setNewIn(null)}
        data={board}
        status={newIn ?? "todo"}
      />
      <TaskSheet id={openId} onClose={() => setOpenId(null)} data={board} />
    </div>
  );
}

export default withQuery(TaskboardPage);
