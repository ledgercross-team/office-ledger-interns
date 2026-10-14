'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { BreakdownDrawer, ScoreBadge } from '@/components/hrms/performance-parts';
import { SeatBar } from '@/components/hrms/seat-bar';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import {
  HRMS_ROLE_LABELS,
  type HrmsMember,
  type HrmsOrg,
  type MemberStatus,
  type Paginated,
  type PerformanceRow,
} from '@/lib/hrms/types';

const STATUS_STYLE: Record<MemberStatus, string> = {
  active: 'bg-mist text-forest',
  suspended: 'bg-amber-tint text-amber-deep',
  deactivated: 'bg-alert-tint text-alert-deep',
};

export default function PeoplePage() {
  const { session } = useHrmsAuth();
  const isAdmin = session?.role === 'ceo' || session?.role === 'coo';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (q.trim()) params.set('q', q.trim());
  if (role) params.set('role', role);
  if (status) params.set('status', status);

  const members = useQuery({
    queryKey: ['hrms', 'members', session?.activeMemberId, params.toString()],
    queryFn: () => hrmsFetch<Paginated<HrmsMember>>(`/members?${params.toString()}`),
    enabled: Boolean(session?.activeMemberId),
  });
  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: isAdmin,
  });

  const scores = useQuery({
    queryKey: ['hrms', 'performance', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: PerformanceRow[] }>('/performance'),
    enabled: isAdmin && Boolean(session?.activeMemberId),
  });
  const scoreOf = (id: string) => scores.data?.items.find((r) => r.memberId === id);
  const [drawer, setDrawer] = useState<string | null>(null);

  const pages = members.data ? Math.max(1, Math.ceil(members.data.total / members.data.pageSize)) : 1;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-charcoal">People</h1>
        {isAdmin && (
          <Link
            href="/people/new"
            className="rounded-xl bg-evergreen px-3 py-2 text-sm font-medium text-white hover:bg-evergreen-dark"
          >
            Add person
          </Link>
        )}
      </div>

      {isAdmin && org.data?.seats && <SeatBar seats={org.data.seats} />}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <input
          aria-label="Search people"
          placeholder="Search name or email"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          {(['ceo', 'coo', 'manager', 'employee'] as const).map((r) => (
            <option key={r} value={r}>
              {HRMS_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </form>

      {members.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {members.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {(members.error as Error).message}
        </p>
      )}

      {members.data && (
        <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-charcoal/10 text-charcoal-soft">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Designation</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {isAdmin && <th className="px-3 py-2 font-medium">Performance</th>}
              </tr>
            </thead>
            <tbody>
              {members.data.items.map((m) => (
                <tr key={m.id} className="border-b border-charcoal/5 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/people/${m.id}`}
                      className="font-medium text-forest hover:underline"
                    >
                      {m.fullName}
                    </Link>
                    <div className="text-charcoal-soft">{m.email}</div>
                  </td>
                  <td className="px-3 py-2">{HRMS_ROLE_LABELS[m.role]}</td>
                  <td className="px-3 py-2">{m.designation ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[m.status]}`}>
                      {m.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setDrawer(m.id)} className="hover:underline">
                        <ScoreBadge row={scoreOf(m.id)} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {members.data.items.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-3 py-6 text-center text-charcoal-soft">
                    No people match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {members.data && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-charcoal/15 px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-charcoal-soft">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-charcoal/15 px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
      {drawer && <BreakdownDrawer memberId={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}
