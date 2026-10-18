'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Checkbox } from './form-fields';
import { EmptyState, ErrorState, Skeleton } from './feedback';
import { Pagination, type PaginationProps } from './navigation';

export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  cardLabel?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  sort?: { id: string; direction: 'asc' | 'desc' };
  onSort?: (id: string) => void;
  selected?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  bulkActions?: ReactNode;
  pagination?: PaginationProps;
}

export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Items will appear here when they are available.',
  emptyAction,
  sort,
  onSort,
  selected,
  onSelectionChange,
  bulkActions,
  pagination,
}: DataTableProps<T>) {
  const selectable = Boolean(selected && onSelectionChange);
  const allSelected = rows.length > 0 && rows.every((row) => selected?.has(rowKey(row)));
  const toggleAll = (checked: boolean) =>
    onSelectionChange?.(checked ? new Set(rows.map(rowKey)) : new Set());
  const toggleRow = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange?.(next);
  };

  if (error)
    return <ErrorState title="Could not load this table" message={error} onRetry={onRetry} />;
  if (!loading && rows.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  const sortIcon = (column: DataColumn<T>) => {
    if (!column.sortable) return null;
    if (sort?.id !== column.id) return <ArrowUpDown aria-hidden className="size-3.5" />;
    return sort.direction === 'asc' ? (
      <ArrowUp aria-hidden className="size-3.5" />
    ) : (
      <ArrowDown aria-hidden className="size-3.5" />
    );
  };

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-card border border-border md:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-sunken/80 text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              {selectable && (
                <th scope="col" className="w-12 px-4 py-3">
                  <Checkbox
                    label="Select all rows"
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    sort?.id === column.id
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : column.sortable
                        ? 'none'
                        : undefined
                  }
                  className={cn('px-4 py-3 font-semibold', column.className)}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 normal-case tracking-normal hover:text-primary"
                      onClick={() => onSort?.(column.id)}
                    >
                      {column.header}
                      {sortIcon(column)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index}>
                    {selectable && (
                      <td className="px-4 py-4">
                        <Skeleton className="size-5" />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-4">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const id = rowKey(row);
                  return (
                    <tr key={id} className="transition-colors hover:bg-surface-sunken/60">
                      {selectable && (
                        <td className="px-4 py-3">
                          <Checkbox
                            label={`Select row ${id}`}
                            checked={selected?.has(id)}
                            onCheckedChange={(checked) => toggleRow(id, checked === true)}
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td key={column.id} className={cn('px-4 py-3 text-fg', column.className)}>
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <div role="group" className="grid gap-3 md:hidden" aria-label={caption}>
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-card border border-border bg-surface p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))
          : rows.map((row) => {
              const id = rowKey(row);
              return (
                <article
                  key={id}
                  className="space-y-3 rounded-card border border-border bg-surface p-4"
                >
                  {selectable && (
                    <Checkbox
                      label="Select item"
                      checked={selected?.has(id)}
                      onCheckedChange={(checked) => toggleRow(id, checked === true)}
                    />
                  )}
                  {columns
                    .filter((column) => !column.hideOnMobile)
                    .map((column) => (
                      <div key={column.id} className="flex items-start justify-between gap-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                          {column.cardLabel ?? column.header}
                        </span>
                        <span className="min-w-0 text-right text-sm text-fg">
                          {column.cell(row)}
                        </span>
                      </div>
                    ))}
                </article>
              );
            })}
      </div>

      {selectable && (selected?.size ?? 0) > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-card border border-primary bg-surface-raised p-3 shadow-float">
          <span className="text-sm font-medium tabular-nums text-fg">
            {selected?.size} selected
          </span>
          <div className="flex gap-2">{bulkActions}</div>
        </div>
      )}
      {pagination && (
        <Pagination {...pagination} label={pagination.label ?? `${caption} pagination`} />
      )}
    </div>
  );
}
