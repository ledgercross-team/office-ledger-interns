import { useMemo, useState } from "react";
import { actions } from "astro:actions";
import { navigate } from "astro:transitions/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Check, ChevronRight, FileUp, GitFork, Mail, Search, Table2, Tags, Users, X } from "lucide-react";
import { withQuery, useServerQuery } from "../query";
import type { EmployeeRow, employeesPage } from "@/lib/queries/employees";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, Checkbox } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/StatTile";
import { parseCsv } from "@/lib/csv";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import OrgItemsEditor from "./OrgItemsEditor";

type Data = Awaited<ReturnType<typeof employeesPage>>;
type Status = "active" | "pending" | "rejected" | "deactivated";

const ROLE_TONE = { owner: "primary", manager: "violet", employee: "neutral" } as const;
const STATUS_TONE = {
  active: "success",
  pending: "warning",
  rejected: "danger",
  deactivated: "neutral",
} as const;

// ---------------------------------------------------------------------------------------------
function ImportDialog({
  open,
  onOpenChange,
  canManagers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canManagers: boolean;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; status: string; message?: string }[] | null>(null);
  const FIELDS: Record<string, string> = {
    name: "name",
    "full name": "name",
    email: "email",
    "employee id": "employeeCode",
    employee_code: "employeeCode",
    "employee code": "employeeCode",
    id: "employeeCode",
    department: "department",
    designation: "designation",
    title: "designation",
    role: "role",
    "joining date": "joinedAt",
    joined_at: "joinedAt",
    joined: "joinedAt",
    phone: "phone",
    "contact number": "phone",
  };
  const validate = (r: Record<string, string>) => {
    const errs: string[] = [];
    if (!r.name || r.name.trim().length < 2) errs.push("name");
    if (!/^\S+@\S+\.\S+$/.test(r.email ?? "")) errs.push("email");
    if (r.role && !["manager", "employee"].includes(r.role.toLowerCase())) errs.push("role");
    if (r.role?.toLowerCase() === "manager" && !canManagers) errs.push("role (owner only)");
    if (r.joinedAt && !/^\d{4}-\d{2}-\d{2}$/.test(r.joinedAt)) errs.push("joining date (YYYY-MM-DD)");
    return errs;
  };
  async function onFile(file: File | undefined) {
    setResult(null);
    if (!file) return;
    const parsed = parseCsv(await file.text());
    const [head, ...body] = parsed;
    if (!head) return setRows([]);
    const keys = head.map((h) => FIELDS[h.trim().toLowerCase()] ?? null);
    setRows(
      body
        .slice(0, 500)
        .map((cells) => Object.fromEntries(keys.map((k, i) => [k ?? `_${i}`, (cells[i] ?? "").trim()]))),
    );
  }
  const valid = rows.filter((r) => !validate(r).length);
  async function run() {
    setBusy(true);
    const { data, error } = await actions.employees.importCsv({
      rows: valid.map((r) => ({
        name: r.name!,
        email: r.email!,
        employeeCode: r.employeeCode ?? "",
        department: r.department ?? "",
        designation: r.designation ?? "",
        role: (r.role?.toLowerCase() as "manager" | "employee") || "employee",
        joinedAt: r.joinedAt ?? "",
        phone: r.phone ?? "",
      })),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setResult(data.results);
    void qc.invalidateQueries({ queryKey: ["employees"] });
    toast.success(`Imported ${data.results.filter((r) => r.status !== "skipped").length} members`);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setRows([]);
          setResult(null);
        }
      }}
    >
      <DialogContent
        className="max-w-3xl"
        title="Import employees from CSV"
        description="Columns: name, email, employee id, department, designation, role, joining date (YYYY-MM-DD), phone. New people get an email to set their password."
      >
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="file:bg-surface-2 block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
          aria-label="CSV file"
        />
        {rows.length > 0 && !result && (
          <div className="border-border max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-muted sticky top-0 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-start">Name</th>
                  <th className="px-3 py-2 text-start">Email</th>
                  <th className="px-3 py-2 text-start">Department</th>
                  <th className="px-3 py-2 text-start">Role</th>
                  <th className="px-3 py-2 text-start">Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const errs = validate(r);
                  return (
                    <tr key={i} className="border-border border-t">
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className="px-3 py-1.5">{r.department}</td>
                      <td className="px-3 py-1.5 capitalize">{r.role || "employee"}</td>
                      <td className="px-3 py-1.5">
                        {errs.length ? (
                          <Badge tone="danger">Fix {errs.join(", ")}</Badge>
                        ) : (
                          <Badge tone="success">
                            <Check aria-hidden /> OK
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {result && (
          <ul className="grid max-h-72 gap-1 overflow-auto text-sm">
            {result.map((r) => (
              <li key={r.email} className="bg-surface-2 flex justify-between gap-2 rounded-lg px-3 py-1.5">
                <span>{r.email}</span>
                <Badge tone={r.status === "skipped" ? "warning" : "success"}>
                  {r.status}
                  {r.message ? ` · ${r.message}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted text-sm">
            {rows.length ? `${valid.length} of ${rows.length} rows ready` : "Choose a CSV file to preview."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {!result && (
              <Button onClick={run} disabled={!valid.length} loading={busy}>
                Import {valid.length || ""}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  data,
  canManagers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: Data;
  canManagers: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    const { data: d, error } = await actions.workspace.sendInvite({
      email: f.email ?? "",
      role: (f.role as "manager" | "employee") ?? "employee",
      departmentId: f.departmentId || null,
      designationId: f.designationId || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setLink(window.location.origin + new URL(d.url).pathname);
    toast.success("Invite sent");
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setLink(null);
      }}
    >
      <DialogContent
        title="Invite by email"
        description="The link is valid for 7 days and joins them straight away with this role and department."
      >
        {link ? (
          <div className="grid gap-3">
            <p className="text-sm">Invite sent. You can also share this link directly:</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invite link"
              />
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Email" required>
              <Input name="email" type="email" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Role">
                <Select name="role" defaultValue="employee">
                  <option value="employee">Employee</option>
                  {canManagers && <option value="manager">Manager</option>}
                </Select>
              </Field>
              <Field label="Department">
                <Select name="departmentId" defaultValue="">
                  <option value="">—</option>
                  {data.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Designation">
                <Select name="designationId" defaultValue="">
                  <option value="">—</option>
                  {data.designations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                <Mail aria-hidden /> Send invite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrgItemsDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: Data;
}) {
  const qc = useQueryClient();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title="Departments & designations"
        description="Rename or remove items; member counts are shown on the right."
      >
        <OrgItemsEditor
          departments={data.departments}
          designations={data.designations}
          usage={data.usage}
          onChanged={() => qc.invalidateQueries({ queryKey: ["employees"] })}
        />
      </DialogContent>
    </Dialog>
  );
}

function OrgChart({ rows }: { rows: EmployeeRow[] }) {
  const active = rows.filter((r) => r.status === "active");
  const byManager = new Map<string | null, EmployeeRow[]>();
  const ids = new Set(active.map((r) => r.id));
  for (const r of active) {
    const key = r.managerId && ids.has(r.managerId) ? r.managerId : null;
    byManager.set(key, [...(byManager.get(key) ?? []), r]);
  }
  const roots = (byManager.get(null) ?? []).sort((a, b) =>
    a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name),
  );
  const Node = ({ r, depth }: { r: EmployeeRow; depth: number }) => {
    const kids = byManager.get(r.id) ?? [];
    return (
      <li className={cn(depth > 0 && "border-border border-s ps-5")}>
        <a
          href={`/app/employees/${r.id}`}
          className="border-border bg-surface shadow-card hover:bg-surface-2 my-1.5 inline-flex items-center gap-3 rounded-xl border px-3 py-2"
        >
          <Avatar name={r.name} image={r.image} size="sm" />
          <span>
            <span className="block text-sm font-medium">{r.name}</span>
            <span className="text-muted text-xs">
              {r.designation ?? r.role}
              {kids.length ? ` · ${kids.length} report${kids.length > 1 ? "s" : ""}` : ""}
            </span>
          </span>
        </a>
        {kids.length > 0 && (
          <ul className="ms-4">
            {kids
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((k) => (
                <Node key={k.id} r={k} depth={depth + 1} />
              ))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <ul className="overflow-x-auto" aria-label="Organisation chart">
      {roots.map((r) => (
        <Node key={r.id} r={r} depth={0} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
function EmployeesPage({
  initial,
  canImport,
  canManagers,
  initialTab,
}: {
  initial: Data;
  canImport: boolean;
  canManagers: boolean;
  initialTab?: Status;
}) {
  const qc = useQueryClient();
  const { data = initial, isFetching } = useServerQuery(
    ["employees"],
    () => actions.employees.list.orThrow(),
    initial,
  );
  const [tab, setTab] = useState<Status>(initialTab ?? "active");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [desig, setDesig] = useState("");
  const [view, setView] = useState<"table" | "org">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"import" | "invite" | "org" | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c = { active: 0, pending: 0, rejected: 0, deactivated: 0 };
    for (const e of data.employees) c[e.status]++;
    return c;
  }, [data.employees]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.employees.filter(
      (e) =>
        e.status === tab &&
        (!dept || e.departmentId === dept) &&
        (!desig || e.designationId === desig) &&
        (!needle ||
          [e.employeeCode, e.name, e.email, e.phone, e.department, e.designation].some((v) =>
            v?.toLowerCase().includes(needle),
          )),
    );
  }, [data.employees, tab, q, dept, desig]);
  const deptCount = new Set(rows.map((r) => r.departmentId).filter(Boolean)).size;

  async function decide(kind: "approve" | "reject", ids: string[]) {
    setBusy(true);
    const res =
      kind === "approve" ? await actions.employees.approve({ ids }) : await actions.employees.reject({ ids });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(`${kind === "approve" ? "Approved" : "Rejected"} ${res.data.count}`);
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ["employees"] });
    void qc.invalidateQueries({ queryKey: ["shell"] });
  }

  const columns = useMemo<ColumnDef<EmployeeRow, unknown>[]>(() => {
    const cols: ColumnDef<EmployeeRow, unknown>[] = [
      {
        id: "code",
        header: "ID",
        accessorFn: (r) => r.employeeCode ?? "",
        cell: ({ getValue }) => (
          <span className="tabular font-mono text-xs">{(getValue() as string) || "—"}</span>
        ),
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <a
            href={`/app/employees/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-primary flex items-center gap-2.5 font-medium"
          >
            <Avatar name={row.original.name} image={row.original.image} size="sm" /> {row.original.name}
          </a>
        ),
      },
      { id: "designation", header: "Designation", accessorFn: (r) => r.designation ?? "" },
      { id: "department", header: "Department", accessorFn: (r) => r.department ?? "" },
      {
        id: "joined",
        header: "Joining date",
        accessorFn: (r) => r.joinedAt ?? "",
        cell: ({ getValue }) => (
          <span className="tabular">{getValue() ? fmtDate(getValue() as string) : "—"}</span>
        ),
      },
      {
        id: "phone",
        header: "Contact number",
        accessorFn: (r) => r.phone ?? "",
        cell: ({ getValue }) => <span className="tabular">{(getValue() as string) || "—"}</span>,
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (r) => r.role,
        cell: ({ row }) => (
          <Badge tone={ROLE_TONE[row.original.role]} className="capitalize">
            {row.original.role}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (r) => r.email,
        cell: ({ getValue }) => <span className="text-muted">{getValue() as string}</span>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) =>
          tab === "pending" ? (
            <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="success"
                onClick={() => decide("approve", [row.original.id])}
                disabled={busy}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide("reject", [row.original.id])}
                disabled={busy}
              >
                Reject
              </Button>
            </span>
          ) : (
            <ChevronRight className="text-muted ms-auto size-4 rtl:rotate-180" aria-hidden />
          ),
      },
    ];
    if (tab === "pending")
      cols.unshift({
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => (
          <Checkbox
            aria-label="Select all"
            checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
            onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
          />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              aria-label={`Select ${row.original.name}`}
              checked={selected.has(row.original.id)}
              onCheckedChange={(v) => {
                const next = new Set(selected);
                if (v) next.add(row.original.id);
                else next.delete(row.original.id);
                setSelected(next);
              }}
            />
          </span>
        ),
      });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rows, selected, busy]);

  const filtersActive = q || dept || desig;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as Status);
            setSelected(new Set());
          }}
        >
          <TabsList>
            <TabsTrigger value="active" count={counts.active}>
              Active
            </TabsTrigger>
            <TabsTrigger value="pending" count={counts.pending}>
              Pending
            </TabsTrigger>
            <TabsTrigger value="rejected" count={counts.rejected}>
              Rejected
            </TabsTrigger>
            <TabsTrigger value="deactivated" count={counts.deactivated}>
              Deactivated
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog("org")}>
            <Tags aria-hidden /> Departments
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog("invite")}>
            <Mail aria-hidden /> Invite
          </Button>
          {canImport && (
            <Button variant="outline" size="sm" onClick={() => setDialog("import")}>
              <FileUp aria-hidden /> Import CSV
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Employee list"
          description={`${rows.length} employee${rows.length === 1 ? "" : "s"} in view across ${deptCount} department${deptCount === 1 ? "" : "s"}`}
          actions={
            tab === "active" && (
              <div className="bg-surface-2 flex rounded-xl p-1" role="group" aria-label="View">
                <Button
                  size="sm"
                  variant={view === "table" ? "outline" : "ghost"}
                  onClick={() => setView("table")}
                  aria-pressed={view === "table"}
                >
                  <Table2 aria-hidden /> Table
                </Button>
                <Button
                  size="sm"
                  variant={view === "org" ? "outline" : "ghost"}
                  onClick={() => setView("org")}
                  aria-pressed={view === "org"}
                >
                  <GitFork aria-hidden /> Org chart
                </Button>
              </div>
            )
          }
        />
        <CardBody>
          {view === "org" && tab === "active" ? (
            <OrgChart rows={data.employees} />
          ) : (
            <DataTable
              caption="Employees"
              columns={columns}
              data={rows}
              loading={isFetching && !data}
              csvName={`employees-${tab}`}
              initialSort={[{ id: "code", desc: false }]}
              initialHidden={{ email: false }}
              onRowClick={(r) => navigate(`/app/employees/${r.id}`)}
              toolbar={
                <>
                  <div className="relative min-w-56 flex-1 sm:max-w-xs">
                    <Search
                      className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search ID, name, email, phone…"
                      className="ps-9"
                      aria-label="Search employees"
                    />
                  </div>
                  <Select
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    className="w-auto min-w-40"
                    aria-label="Department"
                  >
                    <option value="">All departments</option>
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={desig}
                    onChange={(e) => setDesig(e.target.value)}
                    className="w-auto min-w-40"
                    aria-label="Designation"
                  >
                    <option value="">All designations</option>
                    {data.designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  {filtersActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQ("");
                        setDept("");
                        setDesig("");
                      }}
                    >
                      <X aria-hidden /> Clear filters
                    </Button>
                  )}
                  {tab === "pending" && selected.size > 0 && (
                    <span className="bg-primary-soft flex items-center gap-2 rounded-xl px-2 py-1 text-sm">
                      <span className="tabular text-primary px-1 font-medium">{selected.size} selected</span>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => decide("approve", [...selected])}
                        loading={busy}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide("reject", [...selected])}
                        disabled={busy}
                      >
                        Reject
                      </Button>
                    </span>
                  )}
                </>
              }
              empty={
                <EmptyState
                  icon={Users}
                  title={
                    filtersActive
                      ? "No matches"
                      : tab === "pending"
                        ? "No pending requests"
                        : `No ${tab} members`
                  }
                  description={
                    filtersActive
                      ? "Try a different search or clear the filters."
                      : tab === "pending"
                        ? "Share the invite code from the dashboard to let people request access."
                        : undefined
                  }
                />
              }
            />
          )}
        </CardBody>
      </Card>

      <ImportDialog
        open={dialog === "import"}
        onOpenChange={(o) => setDialog(o ? "import" : null)}
        canManagers={canManagers}
      />
      <InviteDialog
        open={dialog === "invite"}
        onOpenChange={(o) => setDialog(o ? "invite" : null)}
        data={data}
        canManagers={canManagers}
      />
      <OrgItemsDialog open={dialog === "org"} onOpenChange={(o) => setDialog(o ? "org" : null)} data={data} />
    </div>
  );
}

export default withQuery(EmployeesPage);
