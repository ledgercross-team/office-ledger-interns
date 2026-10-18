'use client';

import {
  Banner,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDateTime } from '@/lib/hrms/time';
import type { AuditEntry, Paginated } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

function Entry({ entry, canNote }: { entry: AuditEntry; canNote: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      hrmsFetch(`/audit/${entry.id}/notes`, { method: 'POST', body: { note: note.trim() } }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'audit'] });
      toast({
        title: 'Note added',
        description: 'The history entry was updated with your note.',
        tone: 'success',
      });
    },
    onError: (e) => setError(e instanceof HrmsApiError ? e.message : 'Something went wrong.'),
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
      <p className="text-sm text-charcoal">
        <span className="font-medium">{entry.action}</span> on {entry.table}
        {entry.actor?.fullName ? ` by ${entry.actor.fullName}` : ' by the system'}
      </p>
      <p className="text-xs text-charcoal-soft">{formatDateTime(entry.at)}</p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`audit-details-${entry.id}`}
        className="text-xs text-forest hover:underline"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <pre
          id={`audit-details-${entry.id}`}
          className="overflow-x-auto rounded-xl bg-mist p-2 text-xs"
        >
          {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
        </pre>
      )}
      {entry.notes.map((n) => (
        <p
          key={n.id}
          className="rounded-xl border border-evergreen/30 bg-mist p-2 text-sm text-charcoal"
        >
          Note from {n.authorName}: {n.note}
        </p>
      ))}
      {canNote && (
        <div className="flex gap-2">
          <label htmlFor={`audit-note-${entry.id}`} className="sr-only">
            Note for this history entry
          </label>
          <input
            id={`audit-note-${entry.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (the entry itself never changes)"
            className={input}
          />
          <button
            type="button"
            disabled={note.trim().length === 0 || add.isPending}
            onClick={() => add.mutate()}
            className={secondary}
          >
            Add note
          </button>
        </div>
      )}
      {error && (
        <Banner tone="danger" title="Could not add note">
          {error}
        </Banner>
      )}
    </li>
  );
}

function History() {
  const { session } = useHrmsAuth();
  const [table, setTable] = useState('');
  const [from, setFrom] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (table.trim()) params.set('table', table.trim());
  if (from) params.set('from', new Date(from).toISOString());
  const data = useQuery({
    queryKey: ['hrms', 'audit', params.toString()],
    queryFn: () => hrmsFetch<Paginated<AuditEntry>>(`/audit?${params.toString()}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Review organisation changes and add context without changing the original record."
      />
      <div className="flex flex-wrap gap-2">
        <label htmlFor="history-table" className="sr-only">
          Filter by table
        </label>
        <input
          id="history-table"
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setPage(1);
          }}
          placeholder="Table, e.g. tasks"
          className={`${input} sm:w-48`}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="From"
          className={`${input} sm:w-48`}
        />
      </div>
      {data.isLoading && (
        <div className="space-y-3" aria-label="Loading history">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      )}
      {data.error && (
        <ErrorState
          title="Could not load history"
          message={data.error instanceof Error ? data.error.message : 'Please try again.'}
          onRetry={() => void data.refetch()}
        />
      )}
      {data.data && data.data.items.length === 0 && (
        <EmptyState
          title="No history entries"
          description="Changes to organisation records will appear here."
        />
      )}
      {data.data && data.data.items.length > 0 && (
        <ul className="space-y-3">
          {data.data.items.map((e) => (
            <Entry key={e.id} entry={e} canNote={session?.role === 'ceo'} />
          ))}
        </ul>
      )}
      {data.data && (
        <Pagination
          page={page}
          pageSize={data.data.pageSize}
          total={data.data.total}
          onPage={setPage}
        />
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <History />
    </RoleGate>
  );
}
