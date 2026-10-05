import { useMemo, useState } from "react";
import { actions } from "astro:actions";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Search, X } from "lucide-react";
import { withQuery } from "../query";
import type { AuditRow } from "@/actions/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/StatTile";
import { fmtDateTime } from "@/lib/dates";

const GROUP_TONE: Record<string, Tone> = {
  member: "violet",
  settings: "primary",
  leave: "info",
  attendance: "warning",
  holiday: "teal",
  complaint: "danger",
  workspace: "danger",
  ownership: "danger",
};

function AuditPage({
  initial,
  range,
  tz,
}: {
  initial: AuditRow[];
  range: { from: string; to: string };
  tz: string;
}) {
  const [r, setR] = useState(range);
  const [draft, setDraft] = useState(range);
  const { data = initial, isFetching } = useQuery({
    queryKey: ["audit", r.from, r.to],
    queryFn: () => actions.settings.audit.orThrow(r),
    initialData: r.from === range.from && r.to === range.to ? initial : undefined,
    initialDataUpdatedAt: Date.now(),
    placeholderData: (p) => p,
  });
  const [group, setGroup] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const groups = [...new Set(data.map((d) => d.action.split(".")[0]!))].sort();
  const actors = [...new Set(data.map((d) => d.actor).filter(Boolean))].sort() as string[];
  const rows = data.filter(
    (d) =>
      (!group || d.action.startsWith(group + ".")) &&
      (!actor || d.actor === actor) &&
      (!q || `${d.summary} ${d.action}`.toLowerCase().includes(q.toLowerCase())),
  );
  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        id: "when",
        header: "When",
        accessorFn: (d) => new Date(d.createdAt).getTime(),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">{fmtDateTime(row.original.createdAt, tz)}</span>
        ),
        meta: { csv: (d) => new Date(d.createdAt).toISOString() },
      },
      { id: "actor", header: "Who", accessorFn: (d) => d.actor ?? "System" },
      {
        id: "action",
        header: "Action",
        accessorFn: (d) => d.action,
        cell: ({ getValue }) => (
          <Badge tone={GROUP_TONE[(getValue() as string).split(".")[0]!] ?? "neutral"} className="font-mono">
            {getValue() as string}
          </Badge>
        ),
      },
      {
        id: "summary",
        header: "What",
        accessorFn: (d) => d.summary,
        cell: ({ row }) => (
          <span className="block max-w-xl">
            {row.original.summary}
            {row.original.meta && "changes" in row.original.meta && (
              <span className="text-muted mt-0.5 block text-xs">
                {Object.entries(row.original.meta.changes as Record<string, { from: unknown; to: unknown }>)
                  .slice(0, 4)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`)
                  .join(" · ")}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "entity",
        header: "Record",
        accessorFn: (d) => d.entityType,
        cell: ({ getValue }) => <span className="text-muted text-xs">{getValue() as string}</span>,
      },
    ],
    [tz],
  );
  return (
    <Card>
      <CardHeader
        title="Activity"
        description={`${rows.length} of ${data.length} events${data.length >= 5000 ? " (latest 5,000)" : ""}`}
      />
      <CardBody className="grid gap-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setR(draft);
          }}
        >
          <Field label="From">
            <Input
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={draft.to}
              min={draft.from}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </Field>
          <Button type="submit" variant="outline" loading={isFetching}>
            Apply
          </Button>
        </form>
        <DataTable
          caption="Audit log"
          columns={columns}
          data={rows}
          csvName={`audit-${r.from}-to-${r.to}`}
          pageSize={50}
          initialSort={[{ id: "when", desc: true }]}
          toolbar={
            <>
              <div className="relative min-w-52">
                <Search
                  className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="h-9 ps-9"
                  aria-label="Search audit log"
                />
              </div>
              <Select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="h-9 w-auto"
                aria-label="Action type"
              >
                <option value="">All actions</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="h-9 w-auto"
                aria-label="Who"
              >
                <option value="">Everyone</option>
                {actors.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
              {(q || group || actor) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setQ("");
                    setGroup("");
                    setActor("");
                  }}
                >
                  <X aria-hidden /> Clear
                </Button>
              )}
            </>
          }
          empty={<EmptyState icon={History} title="No events in this range" />}
        />
      </CardBody>
    </Card>
  );
}

export default withQuery(AuditPage);
