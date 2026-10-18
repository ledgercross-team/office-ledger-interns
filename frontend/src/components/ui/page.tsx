'use client';

import { Dialog } from 'radix-ui';
import { Command, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './form-fields';

export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {breadcrumbs}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
        </div>
        {(primaryAction || secondaryActions) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}

export interface FilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}
export function FilterBar({
  search,
  onSearchChange,
  searchLabel = 'Search',
  children,
  chips = [],
  onClear,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  children?: ReactNode;
  chips?: FilterChip[];
  onClear?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        {onSearchChange && (
          <div className="min-w-56 flex-1">
            <Input
              label={searchLabel}
              value={search ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search…"
            />
          </div>
        )}
        <div className="flex flex-1 flex-wrap items-end gap-2">{children}</div>
      </div>
      {chips.length > 0 && (
        <div role="group" className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <Badge key={chip.id} tone="primary">
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="rounded-full"
              >
                <X aria-hidden className="size-3" />
              </button>
            </Badge>
          ))}
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon?: ReactNode;
  onSelect: () => void;
}
export function CommandPalette({ items, trigger }: { items: CommandItem[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    const seen = new Map<string, number>();
    return items
      .filter((item) =>
        `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase().includes(needle),
      )
      .filter((item) => {
        if (item.group === 'Pages') return true;
        const count = (seen.get(item.group) ?? 0) + 1;
        seen.set(item.group, count);
        return count <= 4;
      });
  }, [items, query]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Command aria-hidden className="size-4" />
            Search <kbd className="rounded border border-border px-1 text-xs">⌘K</kbd>
          </Button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 motion-fade" />
        <Dialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-card border border-border bg-surface-raised p-3 shadow-float motion-scale-in">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search pages and available records
          </Dialog.Description>
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search aria-hidden className="size-5 text-fg-muted" />
            <input
              autoFocus
              aria-label="Search command palette"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, people, projects and tasks"
              // Inline: the global :focus-visible ring is unlayered and outranks utility classes.
              style={{ outline: 'none' }}
              className="min-h-12 flex-1 bg-transparent text-sm placeholder:text-fg-subtle"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-fg-muted">No results.</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex min-h-10 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-fg-subtle">{item.group}</span>
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
