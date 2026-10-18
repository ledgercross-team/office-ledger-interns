'use client';

import { Pagination } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDateTime } from '@/lib/hrms/time';
import { describeAudit, HISTORY_FILTERS, type Names } from '@/lib/hrms/audit-describe';
import type { AuditEntry, AuditPage } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

function Entry({ entry, names, canNote }: { entry: AuditEntry; names: Names; canNote: boolean }) {
  const summary = describeAudit(entry, names);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      hrmsFetch(`/audit/${entry.id}/notes`, { method: 'POST', body: { note: note.trim() } }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'audit'] });
    },
    onError: (e) => setError(e instanceof HrmsApiError ? e.message : 'Something went wrong.'),
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
      <p className="text-sm font-medium text-charcoal">{summary.sentence}</p>
      {summary.reason && <p className="text-sm text-charcoal-soft">“{summary.reason}”</p>}
      <p className="text-xs text-charcoal-soft">{formatDateTime(entry.at)}</p>
      {summary.changes.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs text-forest hover:underline"
          >
            {open ? 'Hide details' : 'Show details'}
          </button>
          {open && (
            <dl className="space-y-1 rounded-xl bg-mist p-2 text-xs">
              {summary.changes.map((c) => (
                <div key={c.label} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">{c.label}:</dt>
                  <dd>
                    {c.from !== null && c.to !== null
                      ? `${c.from} → ${c.to}`
                      : (c.to ?? `${c.from} (removed)`)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
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
          <input
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
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
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
    queryFn: () => hrmsFetch<AuditPage>(`/audit?${params.toString()}`),
  });

  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">History</h1>
      <div className="flex flex-wrap gap-2">
        <select
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setPage(1);
          }}
          aria-label="Show"
          className={`${input} sm:w-56`}
        >
          {HISTORY_FILTERS.map((f) => (
            <option key={f.label} value={f.tables}>
              {f.label}
            </option>
          ))}
        </select>
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
      {data.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      <ul className="space-y-3">
        {data.data?.items.map((e) => (
          <Entry key={e.id} entry={e} names={data.data.names} canNote={session?.role === 'ceo'} />
        ))}
      </ul>
      {data.data && (
        <Pagination
          page={page}
          pageSize={data.data.pageSize}
          total={data.data.total}
          onPage={setPage}
        />
      )}
    </>
  );
}

export default function HistoryPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <History />
    </RoleGate>
  );
}
