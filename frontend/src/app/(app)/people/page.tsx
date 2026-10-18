'use client';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  PageShell,
  Pagination,
  Skeleton,
  controlClass,
} from '@/components/ui';
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

const STATUS_TONE: Record<MemberStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  suspended: 'warning',
  deactivated: 'danger',
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

  return (
    <PageShell>
      <PageHeader
        title={session?.role === 'manager' ? 'Team' : 'People'}
        description={
          session?.role === 'manager'
            ? 'See the people connected to your projects and work.'
            : 'Manage people, roles, and organisation access.'
        }
        primaryAction={
          isAdmin ? (
            <Button asChild>
              <Link href="/people/new">Add person</Link>
            </Button>
          ) : undefined
        }
      />

      {isAdmin && org.data?.seats && <SeatBar seats={org.data.seats} />}

      <FilterBar
        search={q}
        searchLabel="Search people"
        onSearchChange={(value) => {
          setQ(value);
          setPage(1);
        }}
      >
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          className={`${controlClass} sm:w-auto sm:min-w-36`}
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
          className={`${controlClass} sm:w-auto sm:min-w-36`}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </FilterBar>

      {members.isLoading && (
        <div className="space-y-3" aria-label="Loading people">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      )}
      {members.error && (
        <ErrorState
          title="Could not load people"
          message={(members.error as Error).message}
          onRetry={() => void members.refetch()}
        />
      )}

      {members.data && (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-fg-muted">
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
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/people/${m.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {m.fullName}
                      </Link>
                      <div className="text-fg-muted">{m.email}</div>
                    </td>
                    <td className="px-3 py-2">{HRMS_ROLE_LABELS[m.role]}</td>
                    <td className="px-3 py-2">{m.designation ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setDrawer(m.id)}
                          className="hover:underline"
                        >
                          <ScoreBadge row={scoreOf(m.id)} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {members.data.items.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="p-3">
                      <EmptyState
                        title="No people match"
                        description="Try changing the search or filters."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 lg:hidden">
            {members.data.items.map((m) => (
              <article
                key={m.id}
                className="min-w-0 rounded-card border border-border bg-surface p-4"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/people/${m.id}`}
                      className="break-words font-medium text-primary hover:underline"
                    >
                      {m.fullName}
                    </Link>
                    <p className="mt-1 break-all text-xs text-fg-muted">{m.email}</p>
                  </div>
                  <Badge tone={STATUS_TONE[m.status]} className="shrink-0">
                    {m.status}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-fg-muted">Role</dt>
                    <dd className="mt-0.5 font-medium text-fg">{HRMS_ROLE_LABELS[m.role]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Designation</dt>
                    <dd className="mt-0.5 break-words text-fg">{m.designation ?? '—'}</dd>
                  </div>
                  {isAdmin && (
                    <div className="col-span-2 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() => setDrawer(m.id)}
                        className="text-left hover:underline"
                      >
                        <span className="mr-2 text-xs text-fg-muted">Performance</span>
                        <ScoreBadge row={scoreOf(m.id)} />
                      </button>
                    </div>
                  )}
                </dl>
              </article>
            ))}
            {members.data.items.length === 0 && (
              <EmptyState
                title="No people match"
                description="Try changing the search or filters."
              />
            )}
          </div>
        </>
      )}

      {members.data && (
        <Pagination
          page={page}
          pageSize={members.data.pageSize}
          total={members.data.total}
          onPage={setPage}
        />
      )}
      {drawer && <BreakdownDrawer memberId={drawer} onClose={() => setDrawer(null)} />}
    </PageShell>
  );
}
