'use client';

import Link from 'next/link';
import { Tabs as TabsPrimitive, ToggleGroup } from 'radix-ui';
import { ChevronLeft, ChevronsRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export interface TabItem { value: string; label: string; count?: number; content: ReactNode }
export function Tabs({ items, defaultValue, value, onValueChange, label }: { items: TabItem[]; defaultValue?: string; value?: string; onValueChange?: (value: string) => void; label: string }) {
  return <TabsPrimitive.Root defaultValue={defaultValue ?? items[0]?.value} value={value} onValueChange={onValueChange}><TabsPrimitive.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">{items.map((item) => <TabsPrimitive.Trigger key={item.value} value={item.value} className="min-h-10 shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted data-[state=active]:border-primary data-[state=active]:text-primary">{item.label}{item.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 text-xs tabular-nums">{item.count}</span>}</TabsPrimitive.Trigger>)}</TabsPrimitive.List>{items.map((item) => <TabsPrimitive.Content key={item.value} value={item.value} className="pt-5 focus-visible:outline-none">{item.content}</TabsPrimitive.Content>)}</TabsPrimitive.Root>;
}

export function SegmentedControl({ label, options, value, onValueChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void }) {
  return <ToggleGroup.Root type="single" aria-label={label} value={value} onValueChange={(next) => next && onValueChange(next)} className="inline-flex rounded-control border border-border bg-surface p-1">{options.map((option) => <ToggleGroup.Item key={option.value} value={option.value} className="min-h-8 rounded-control px-3 text-xs font-medium text-fg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-fg">{option.label}</ToggleGroup.Item>)}</ToggleGroup.Root>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">{items.map((item, index) => <li key={`${item.label}-${index}`} className="flex items-center gap-1">{index > 0 && <span aria-hidden>/</span>}{item.href ? <Link className="hover:text-primary hover:underline" href={item.href}>{item.label}</Link> : <span aria-current="page" className="text-fg">{item.label}</span>}</li>)}</ol></nav>;
}

export interface PaginationProps { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize?: (size: number) => void; pageSizeOptions?: readonly number[]; pageSizeId?: string; label?: string }

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
export function pageWindow(page: number, pages: number): Array<number | null> {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { wanted.add(2); wanted.add(3); }
  if (page >= pages - 2) { wanted.add(pages - 1); wanted.add(pages - 2); }
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).sort((x, y) => x - y);
  const out: Array<number | null> = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = [10, 25, 50], pageSizeId = 'page-size', label = 'Pagination' }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  if (pages <= 1 && !onPageSize) return null;
  const numberClass = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-control px-3 text-sm font-medium tabular-nums';
  return (
    <nav aria-label={label} className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-fg-muted">Showing <span className="font-medium tabular-nums text-fg">{first}–{last}</span> of <span className="font-medium tabular-nums text-fg">{total}</span></p>
      <div className="flex flex-wrap items-center gap-1.5">
        {onPageSize && (
          <>
            <label htmlFor={pageSizeId} className="text-xs font-medium text-fg">Rows</label>
            <select id={pageSizeId} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="mr-2 min-h-10 rounded-control border border-border bg-surface px-2 text-sm">
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </>
        )}
        {pages > 1 && (
          <>
            <Button variant="secondary" iconOnly aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden className="size-4" /></Button>
            {pageWindow(page, pages).map((n, index) => n === null
              ? <span key={`gap-${index}`} aria-hidden className="px-1 text-fg-muted">…</span>
              : n === page
                ? <span key={n} aria-current="page" className={`${numberClass} bg-primary text-primary-fg`}>{n}</span>
                : <button key={n} type="button" aria-label={`Page ${n}`} onClick={() => onPage(n)} className={`${numberClass} border border-border bg-surface text-fg hover:bg-surface-sunken`}>{n}</button>)}
            <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>View more<ChevronsRight aria-hidden className="size-4" /></Button>
          </>
        )}
      </div>
    </nav>
  );
}
