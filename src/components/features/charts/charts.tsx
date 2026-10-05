/**
 * Chart primitives. Colors come from the attendance status tokens (validated as a set for both
 * themes with the dataviz palette validator), so a series always matches its status pill.
 * Every chart ships: a labelled legend (identity never by color alone), a hover tooltip, and a
 * table view toggle.
 */
import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";

export const SERIES = {
  present: { label: "Present", color: "var(--success)" },
  late: { label: "Late", color: "var(--warning)" },
  remote: { label: "Remote", color: "var(--info)" },
  onLeave: { label: "On leave", color: "var(--violet)" },
  absent: { label: "Absent", color: "var(--danger)" },
} as const;
export type SeriesKey = keyof typeof SERIES;

function TableToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      aria-pressed={on}
      className="text-muted hover:bg-surface-2 hover:text-text inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
    >
      <Table2 className="size-3.5" aria-hidden /> {on ? "Chart" : "Table"}
    </button>
  );
}

function Swatch({ color, line }: { color: string; line?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0", line ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]")}
      style={{ background: color }}
    />
  );
}

interface Point {
  date: string;
  isWorkday: boolean;
  present: number;
  late: number;
  remote: number;
}

export function MomentumChart({
  data,
  series,
  height = 220,
}: {
  data: Point[];
  series: ("present" | "late" | "remote")[];
  height?: number;
}) {
  const [table, setTable] = useState(false);
  const gid = useId().replace(/:/g, "");
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(data.length / 7));
    return data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d) => d.date);
  }, [data]);
  const last = data.at(-1);
  return (
    <div className="grid gap-2">
      <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {series.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <Swatch color={SERIES[k].color} line /> {SERIES[k].label}
            {last && <span className="tabular text-text font-medium">{last[k]}</span>}
          </span>
        ))}
        <span className="ms-auto">
          <TableToggle on={table} set={setTable} />
        </span>
      </div>
      {table ? (
        <div className="border-border max-h-60 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily attendance counts</caption>
            <thead className="bg-surface-2 text-muted sticky top-0 text-xs uppercase">
              <tr>
                <th className="px-3 py-1.5 text-start">Date</th>
                {series.map((k) => (
                  <th key={k} className="px-3 py-1.5 text-end">
                    {SERIES[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-border border-t">
                  <td className="px-3 py-1">
                    {fmtDate(d.date, "en-US", { weekday: "short", year: undefined })}
                    {!d.isWorkday && <span className="text-muted text-xs"> · off</span>}
                  </td>
                  {series.map((k) => (
                    <td key={k} className="tabular px-3 py-1 text-end">
                      {d[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{ height }}
          role="img"
          aria-label={`Attendance over ${data.length} days. Latest: ${series.map((k) => `${SERIES[k].label} ${last?.[k] ?? 0}`).join(", ")}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={(d: string) => fmtDate(d, "en-US", { year: undefined })}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "var(--text-muted)", strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="border-border bg-surface shadow-pop rounded-xl border px-3 py-2 text-xs">
                      <p className="mb-1 font-medium">
                        {fmtDate(String(label), "en-US", { weekday: "short" })}
                      </p>
                      {payload.map((p) => (
                        <p key={String(p.dataKey)} className="flex items-center gap-2">
                          <Swatch color={SERIES[p.dataKey as SeriesKey].color} line />{" "}
                          {SERIES[p.dataKey as SeriesKey].label}
                          <span className="tabular ms-auto font-semibold">{String(p.value)}</span>
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              {series.includes("present") && (
                <Area
                  type="monotone"
                  dataKey="present"
                  stroke="var(--success)"
                  strokeWidth={2}
                  fill={`url(#g-${gid})`}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
              {series.includes("late") && (
                <Line
                  type="monotone"
                  dataKey="late"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
              {series.includes("remote") && (
                <Line
                  type="monotone"
                  dataKey="remote"
                  stroke="var(--info)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function MixDonut({ values }: { values: Record<SeriesKey, number> }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<SeriesKey | null>(null);
  const keys = Object.keys(SERIES) as SeriesKey[];
  const data = keys.map((k) => ({ key: k, value: values[k] }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <TableToggle on={table} set={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Today's operations mix</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-border border-t first:border-0">
                <th scope="row" className="py-1 text-start font-normal">
                  {SERIES[d.key].label}
                </th>
                <td className="tabular py-1 text-end font-semibold">{d.value}</td>
                <td className="tabular text-muted w-16 py-1 text-end">
                  {total ? Math.round((d.value / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid items-center gap-4">
          <div
            className="relative mx-auto size-40"
            role="img"
            aria-label={data.map((d) => `${SERIES[d.key].label} ${d.value}`).join(", ")}
          >
            {total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="key"
                    innerRadius="68%"
                    outerRadius="100%"
                    stroke="var(--surface)"
                    strokeWidth={2}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                    onMouseEnter={(_, i) => setHover(data.filter((d) => d.value > 0)[i]?.key ?? null)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {data
                      .filter((d) => d.value > 0)
                      .map((d) => (
                        <Cell
                          key={d.key}
                          fill={SERIES[d.key].color}
                          opacity={hover && hover !== d.key ? 0.45 : 1}
                        />
                      ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="border-surface-2 size-full rounded-full border-[14px]" />
            )}
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="tabular text-2xl font-semibold">{hover ? values[hover] : total}</p>
                <p className="text-muted text-xs">{hover ? SERIES[hover].label : "people"}</p>
              </div>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {data.map((d) => (
              <li
                key={d.key}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-0.5",
                  hover === d.key && "bg-surface-2",
                )}
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
              >
                <Swatch color={SERIES[d.key].color} /> {SERIES[d.key].label}
                <span className="tabular ms-auto font-semibold">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Tiny trend line (no axes) with an end dot; nulls are gaps. */
export function Sparkline({
  values,
  label,
  width = 72,
  height = 22,
}: {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="text-muted text-xs">—</span>;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums, 100);
  const x = (i: number) => 2 + (i * (width - 6)) / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  const lastVal = values[lastIdx]!;
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <title>{label}</title>
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(lastIdx)}
        cy={y(lastVal)}
        r={3}
        fill="var(--primary)"
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}
