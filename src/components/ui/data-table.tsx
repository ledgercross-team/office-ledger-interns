import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/cn";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "./button";
import { Menu, MenuCheckboxItem, MenuContent, MenuLabel, MenuTrigger } from "./menu";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /** Value written to CSV exports (defaults to the accessor value). */
    csv?: (row: TData) => unknown;
    align?: "start" | "end";
    className?: string;
    _?: TValue;
  }
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** File name for CSV export; omit to hide the export button. */
  csvName?: string;
  initialSort?: SortingState;
  initialHidden?: VisibilityState;
  pageSize?: number;
  toolbar?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: Row<T>) => string | undefined;
  caption: string;
  loading?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  csvName,
  initialSort = [],
  initialHidden = {},
  pageSize = 25,
  toolbar,
  empty,
  onRowClick,
  rowClassName,
  caption,
  loading,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [visibility, setVisibility] = useState<VisibilityState>(initialHidden);
  const [dense, setDense] = useState(false);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: true,
  });
  const paginated = data.length > pageSize;
  const rows = table.getRowModel().rows;

  const exportCsv = useMemo(
    () => () => {
      const cols = table.getVisibleLeafColumns().filter((c) => c.id !== "select" && c.id !== "actions");
      const headers = cols.map((c) => (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id));
      const body = table.getSortedRowModel().rows.map((r) =>
        cols.map((c) => (c.columnDef.meta?.csv ? c.columnDef.meta.csv(r.original) : r.getValue(c.id))),
      );
      downloadCsv(csvName ?? "export", toCsv(headers, body));
    },
    [table, csvName],
  );

  const cellPad = dense ? "px-3 py-1.5" : "px-4 py-3";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setDense((d) => !d)} aria-label={dense ? "Comfortable rows" : "Compact rows"} aria-pressed={dense}>
            {dense ? <Rows3 aria-hidden /> : <Rows4 aria-hidden />}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Choose columns">
                <Columns3 aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Columns</MenuLabel>
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide() && typeof c.columnDef.header === "string")
                .map((c) => (
                  <MenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                    {c.columnDef.header as string}
                  </MenuCheckboxItem>
                ))}
            </MenuContent>
          </Menu>
          {csvName && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data.length}>
              <Download aria-hidden /> CSV
            </Button>
          )}
        </div>
      </div>
      <div className="scrollbar-thin max-h-[70vh] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface-2">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "whitespace-nowrap border-b border-border text-start text-xs font-semibold uppercase tracking-wide text-muted",
                        cellPad,
                        h.column.columnDef.meta?.align === "end" && "text-end",
                      )}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase hover:text-text">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" aria-hidden /> : sorted === "desc" ? <ArrowDown className="size-3" aria-hidden /> : null}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={columns.length} className={cellPad}>
                    <div className="skeleton h-5" />
                  </td>
                </tr>
              ))}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn("border-b border-border transition-colors duration-150 last:border-0 hover:bg-surface-2/70", onRowClick && "cursor-pointer", rowClassName?.(row))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("align-middle", cellPad, cell.column.columnDef.meta?.align === "end" && "text-end tabular", cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={columns.length}>{empty ?? <p className="px-4 py-10 text-center text-sm text-muted">No records.</p>}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginated && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span className="tabular">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(data.length, (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </Button>
            <span className="tabular px-2">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight className="rtl:rotate-180" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
