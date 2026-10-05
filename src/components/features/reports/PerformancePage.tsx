import { useMemo, useState } from "react";
import { actions } from "astro:actions";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Info,
  Printer,
  RotateCcw,
  Search,
  Trophy,
  Zap,
  X,
} from "lucide-react";
import { withQuery } from "../query";
import type { PerformanceData } from "@/lib/queries/reports";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Avatar, Tip } from "@/components/ui/misc";
import { StatTile, EmptyState } from "@/components/layout/StatTile";
import { Sparkline } from "../charts/sparkline";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Row = PerformanceData["rows"][number];
type RankBy = "performance_index" | "attendance_index" | "productivity_index" | "worked_hours";

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev == null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (!d) return <span className="text-muted text-xs">±0</span>;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center text-xs font-medium",
        d > 0 ? "text-success-text" : "text-danger-text",
      )}
      title="vs previous period"
    >
      {d > 0 ? (
        <ArrowUpRight className="size-3.5" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3.5" aria-hidden />
      )}
      {Math.abs(d)}
    </span>
  );
}

function IndexBar({ value, tone }: { value: number | null; tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="tabular w-12 text-end">{pct(value)}</span>
      <span className="bg-surface-2 hidden h-1.5 w-16 overflow-hidden rounded-full sm:block" aria-hidden>
        <span
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </span>
    </span>
  );
}

const FORMULAS = (s: PerformanceData["settings"]) => ({
  attendance: `Attendance index = 100 − penalty points (floored at 0). Penalties: late ${s.scoring.late}, absent ${s.scoring.absent}, missing checkout ${s.scoring.missingCheckout}, half-day ${s.scoring.halfDay}.`,
  productivity: "Productivity index = tracked hours ÷ effective expected hours (capped at 100%).",
  performance: "Performance index = average of the attendance and productivity indexes.",
});

function PerformancePage({
  initial,
  defaults,
}: {
  initial: PerformanceData;
  defaults: { start: string; end: string };
}) {
  const [range, setRange] = useState({ start: initial.start, end: initial.end });
  const [draft, setDraft] = useState(range);
  const { data = initial, isFetching } = useQuery({
    queryKey: ["performance", range.start, range.end],
    queryFn: () => actions.reports.performance.orThrow(range),
    initialData: range.start === initial.start && range.end === initial.end ? initial : undefined,
    initialDataUpdatedAt: Date.now(),
    placeholderData: (p) => p,
  });
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [desig, setDesig] = useState("");
  const [rankBy, setRankBy] = useState<RankBy>("performance_index");
  const f = FORMULAS(data.settings);

  const departments = [...new Set(data.rows.map((r) => r.department).filter(Boolean))] as string[];
  const designations = [...new Set(data.rows.map((r) => r.designation).filter(Boolean))] as string[];
  const ranked = useMemo(
    () =>
      [...data.rows]
        .sort((a, b) => Number(b[rankBy] ?? -1) - Number(a[rankBy] ?? -1) || a.name.localeCompare(b.name))
        .map((r, i) => ({ ...r, rank: i + 1 })),
    [data.rows, rankBy],
  );
  const shown = ranked.filter(
    (r) =>
      (!dept || r.department === dept) &&
      (!desig || r.designation === desig) &&
      (!q || `${r.name} ${r.employee_code}`.toLowerCase().includes(q.toLowerCase())),
  );
  const top = ranked[0];
  const avg = (k: "performance_index" | "productivity_index") => {
    const v = data.rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    if (draft.end < draft.start) return toast.error("End date must be after the start date.");
    setRange(draft);
  }

  const columns = useMemo<ColumnDef<Row & { rank: number }, unknown>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        accessorFn: (r) => r.rank,
        cell: ({ getValue }) => <span className="tabular font-semibold">#{getValue() as number}</span>,
      },
      {
        id: "employee",
        header: "Employee",
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <a
            href={`/app/employees/${row.original.membership_id}`}
            className="hover:text-primary flex items-center gap-2.5"
          >
            <Avatar name={row.original.name} size="sm" />
            <span>
              <span className="block font-medium">{row.original.name}</span>
              <span className="text-muted text-xs">{row.original.employee_code}</span>
            </span>
          </a>
        ),
      },
      { id: "department", header: "Department", accessorFn: (r) => r.department ?? "" },
      { id: "designation", header: "Designation", accessorFn: (r) => r.designation ?? "" },
      {
        id: "attendance",
        header: "Attendance index",
        accessorFn: (r) => r.attendance_index,
        cell: ({ getValue }) => <IndexBar value={getValue() as number} tone="bg-success" />,
      },
      {
        id: "productivity",
        header: "Productivity index",
        accessorFn: (r) => r.productivity_index ?? -1,
        cell: ({ row }) => <IndexBar value={row.original.productivity_index} tone="bg-info" />,
        meta: { csv: (r) => r.productivity_index },
      },
      {
        id: "performance",
        header: "Performance index",
        accessorFn: (r) => r.performance_index,
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <span className="tabular w-12 text-end font-semibold">{pct(row.original.performance_index)}</span>
            <Sparkline values={row.original.trend} label={`Trend over 6 periods for ${row.original.name}`} />
            <Delta now={row.original.performance_index} prev={row.original.previous} />
          </span>
        ),
      },
      { id: "worked", header: "Worked hours", accessorFn: (r) => r.worked_hours, meta: { align: "end" } },
      {
        id: "expected",
        header: "Expected hours",
        accessorFn: (r) => r.expected_hours,
        meta: { align: "end" },
      },
      { id: "late", header: "Late count", accessorFn: (r) => r.late_count, meta: { align: "end" } },
      {
        id: "absent",
        header: "Absent count",
        accessorFn: (r) => r.absent_count,
        cell: ({ getValue }) => (
          <span className={cn((getValue() as number) > 0 && "text-danger-text font-semibold")}>
            {getValue() as number}
          </span>
        ),
        meta: { align: "end" },
      },
    ],
    [],
  );

  const me = !data.viewAll ? data.rows[0] : null;

  return (
    <div className="grid gap-6">
      <Card className="no-print border-dashed">
        <CardBody className="flex items-start gap-3">
          <Info className="text-info mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">How to read this page</p>
            <p className="text-muted">
              The score is based on attendance and tracked hours for the selected period. It is a signal for
              conversations, not a complete HR evaluation. Office hours ({data.settings.officeStart}–
              {data.settings.officeEnd}), weekends, holidays and approved leave are taken into account
              automatically; days count once office hours have ended.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="no-print">
        <CardHeader
          title="Timeline selection"
          description={`Current timeline: ${fmtDate(data.start)} to ${fmtDate(data.end)} · ${data.expectedWorkdays} working days counted so far`}
        />
        <CardBody>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
            <Field label="Start date">
              <Input
                type="date"
                value={draft.start}
                max={draft.end}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={draft.end}
                min={draft.start}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(defaults);
                setRange(defaults);
              }}
            >
              <RotateCcw aria-hidden /> Reset timeline
            </Button>
            <Button type="submit" loading={isFetching}>
              View ranking
            </Button>
          </form>
        </CardBody>
      </Card>

      {me ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <StatTile
            label="Your performance index"
            value={pct(me.performance_index)}
            icon={Trophy}
            tone="primary"
            delta={
              me.previous != null
                ? { value: Math.round((me.performance_index - me.previous) * 10) / 10, suffix: " pts" }
                : null
            }
          />
          <StatTile
            label="Attendance index"
            value={pct(me.attendance_index)}
            icon={Gauge}
            tone="success"
            hint={`${me.late_count} late · ${me.absent_count} absent · ${me.missing_checkout} missing checkout`}
          />
          <StatTile
            label="Productivity index"
            value={pct(me.productivity_index)}
            icon={Zap}
            tone="info"
            hint={`${me.worked_hours}h of ${me.expected_hours}h expected`}
          />
          <Card className="lg:col-span-3">
            <CardHeader
              title="Your trend"
              description="Performance index for the last six periods of the same length."
            />
            <CardBody className="grid gap-4">
              <Sparkline values={me.trend} label="Your performance trend" width={320} height={64} />
              <ul className="text-muted grid gap-1 text-sm">
                <li>{f.attendance}</li>
                <li>{f.productivity}</li>
                <li>{f.performance}</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Top performer"
              value={top ? pct(top.performance_index) : "—"}
              hint={top?.name}
              icon={Trophy}
              tone="primary"
            />
            <StatTile
              label="Avg performance index"
              value={pct(avg("performance_index"))}
              icon={Gauge}
              tone="success"
            />
            <StatTile
              label="Avg productivity index"
              value={pct(avg("productivity_index"))}
              icon={Zap}
              tone="info"
            />
          </div>
          <Card>
            <CardHeader
              title="Ranking"
              description={
                <span className="flex flex-wrap items-center gap-3">
                  {(["attendance", "productivity", "performance"] as const).map((k) => (
                    <Tip key={k} content={f[k]}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs underline decoration-dotted underline-offset-2"
                      >
                        <Info className="size-3.5" aria-hidden /> {k[0]!.toUpperCase() + k.slice(1)} index
                      </button>
                    </Tip>
                  ))}
                </span>
              }
              actions={
                <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()}>
                  <Printer aria-hidden /> PDF
                </Button>
              }
            />
            <CardBody>
              <DataTable
                caption="Performance ranking"
                columns={columns}
                data={shown}
                csvName={`performance-${data.start}-to-${data.end}`}
                initialSort={[{ id: "rank", desc: false }]}
                initialHidden={{ designation: false, expected: false }}
                pageSize={50}
                toolbar={
                  <div className="no-print flex flex-wrap items-center gap-2">
                    <div className="relative min-w-48">
                      <Search
                        className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                        aria-hidden
                      />
                      <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search…"
                        className="h-9 ps-9"
                        aria-label="Search employees"
                      />
                    </div>
                    <Select
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      className="h-9 w-auto"
                      aria-label="Department"
                    >
                      <option value="">All departments</option>
                      {departments.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </Select>
                    <Select
                      value={desig}
                      onChange={(e) => setDesig(e.target.value)}
                      className="h-9 w-auto"
                      aria-label="Designation"
                    >
                      <option value="">All designations</option>
                      {designations.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </Select>
                    <Select
                      value={rankBy}
                      onChange={(e) => setRankBy(e.target.value as RankBy)}
                      className="h-9 w-auto"
                      aria-label="Rank by"
                    >
                      <option value="performance_index">Rank by: Performance index</option>
                      <option value="attendance_index">Rank by: Attendance index</option>
                      <option value="productivity_index">Rank by: Productivity index</option>
                      <option value="worked_hours">Rank by: Hours</option>
                    </Select>
                    {(q || dept || desig || rankBy !== "performance_index") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setQ("");
                          setDept("");
                          setDesig("");
                          setRankBy("performance_index");
                        }}
                      >
                        <X aria-hidden /> Clear filters
                      </Button>
                    )}
                  </div>
                }
                empty={
                  <EmptyState
                    icon={Trophy}
                    title="No one to rank yet"
                    description="Rankings appear once working days in this period have ended."
                  />
                }
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

export default withQuery(PerformancePage);
