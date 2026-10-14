'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { HrmsRole, Paginated } from '@/lib/hrms/types';

export interface MemberOption {
  id: string;
  fullName: string;
  role?: string;
  email?: string;
}

// Suggestions stay short however big the organisation is; typing narrows them.
const MAX_RESULTS = 4;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Search box for choosing a person. Never lists everyone: it asks the API for
 * the best few matches as you type (name or email), so it stays fast with
 * thousands of members. Pass `localOptions` to search a list that is already
 * loaded (for example one project's members) instead of calling the API.
 */
export function MemberSearch({
  label,
  role,
  excludeIds = [],
  localOptions,
  selected = null,
  onSelect,
  onClear,
  name,
  placeholder = 'Search by name or email',
  required = false,
  fetchOptions,
  searchKey,
}: {
  label: string;
  role?: HrmsRole;
  excludeIds?: string[];
  localOptions?: MemberOption[];
  /** Controlled single selection. Omit for add-to-list use (the box clears after a pick). */
  selected?: MemberOption | null;
  onSelect: (member: MemberOption) => void;
  onClear?: () => void;
  /** Form field name that carries the chosen member id. */
  name?: string;
  placeholder?: string;
  required?: boolean;
  /** Use another source than the members list (for example the people you may message). */
  fetchOptions?: (q: string) => Promise<MemberOption[]>;
  /** Cache key for `fetchOptions`. */
  searchKey?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = useDebounced(text.trim(), 250);

  const remote = useQuery({
    queryKey: ['hrms', 'member-search', searchKey ?? role ?? 'any', query],
    queryFn: async () => {
      if (fetchOptions) {
        const items = await fetchOptions(query);
        return {
          items,
          page: 1,
          pageSize: items.length,
          total: items.length,
        } as Paginated<MemberOption>;
      }
      const params = new URLSearchParams({
        status: 'active',
        pageSize: String(MAX_RESULTS + excludeIds.length),
      });
      if (role) params.set('role', role);
      if (query) params.set('q', query);
      return hrmsFetch<Paginated<MemberOption>>(`/members?${params}`);
    },
    enabled: open && !localOptions && !selected,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const needle = text.trim().toLowerCase();
  const pool = localOptions
    ? localOptions.filter((m) => `${m.fullName} ${m.email ?? ''}`.toLowerCase().includes(needle))
    : (remote.data?.items ?? []);
  const results = pool.filter((m) => !excludeIds.includes(m.id)).slice(0, MAX_RESULTS);
  const loading = !localOptions && remote.isFetching && results.length === 0;

  // A typed-but-unpicked value must not submit; native validation says why.
  const needsPick = required && selected === null;
  useEffect(() => {
    inputRef.current?.setCustomValidity(needsPick ? 'Choose a person from the list.' : '');
  }, [needsPick, text]);

  function pick(member: MemberOption) {
    onSelect(member);
    setText('');
    setOpen(false);
    setActive(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative space-y-1.5 text-sm">
      <label htmlFor={id} className="block font-medium text-fg">
        {label}
        {required && (
          <span className="ml-1 text-danger-fg" aria-hidden>
            *
          </span>
        )}
      </label>
      {name && <input type="hidden" name={name} value={selected?.id ?? ''} />}
      {selected ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5">
          <span className="min-w-0 truncate">
            {selected.fullName}
            {selected.role && <span className="text-fg-muted"> · {selected.role}</span>}
          </span>
          {onClear && (
            <button
              type="button"
              aria-label={`Clear ${selected.fullName}`}
              onClick={() => {
                onClear();
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="rounded-control p-1 text-fg-muted hover:bg-surface-sunken hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[active] ? `${id}-opt-${results[active].id}` : undefined
          }
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-fg placeholder:text-fg-subtle"
        />
      )}
      {open && !selected && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface-raised p-1 shadow-float"
        >
          {loading && <li className="px-3 py-2 text-fg-muted">Searching…</li>}
          {remote.isError && !localOptions && (
            <li className="px-3 py-2 text-danger-fg">Could not search. Try again.</li>
          )}
          {!loading && !remote.isError && results.length === 0 && (
            <li className="px-3 py-2 text-fg-muted">
              {needle ? 'No one matches that search.' : 'No one to show.'}
            </li>
          )}
          {results.map((member, index) => (
            <li
              key={member.id}
              id={`${id}-opt-${member.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(member);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer rounded-control px-3 py-2 ${index === active ? 'bg-primary-soft text-fg' : 'text-fg'}`}
            >
              <span className="font-medium">{member.fullName}</span>
              <span className="text-fg-muted">
                {member.role ? ` · ${member.role}` : ''}
                {member.email ? ` · ${member.email}` : ''}
              </span>
            </li>
          ))}
          {!localOptions && results.length >= MAX_RESULTS && (
            <li className="px-3 py-2 text-xs text-fg-muted">Keep typing to narrow the list.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The people picked so far in a multi-select, each removable. */
export function MemberChips({
  members,
  onRemove,
  emptyText,
}: {
  members: MemberOption[];
  onRemove: (id: string) => void;
  emptyText: string;
}) {
  if (members.length === 0) return <p className="text-xs text-fg-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Chosen people">
      {members.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-1 rounded-full border border-border bg-surface-sunken py-1 pl-3 pr-1 text-sm"
        >
          {m.fullName}
          <button
            type="button"
            aria-label={`Remove ${m.fullName}`}
            onClick={() => onRemove(m.id)}
            className="rounded-full p-1 text-fg-muted hover:bg-surface hover:text-fg"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
