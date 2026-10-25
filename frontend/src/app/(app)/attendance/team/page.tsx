'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { message, MonthTable, StatusPill, time } from '@/components/hrms/attendance-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import { EmptyState, ErrorState, PageHeader, PageShell, Skeleton } from '@/components/ui';
import { hrmsFetch, hrmsFetchText } from '@/lib/hrms/api-client';
import type { AttendanceMonth, TeamAttendanceDay } from '@/lib/hrms/types';

const secondary =
  'inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-sunken';

function TeamAttendance() {
  const [date, setDate] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const day = useQuery({
    queryKey: ['hrms', 'attendance', 'team', date],
    queryFn: () => hrmsFetch<TeamAttendanceDay>(`/attendance${date ? `?date=${date}` : ''}`),
  });
  const person = useQuery({
    queryKey: ['hrms', 'attendance', 'person', memberId, month],
    queryFn: () => hrmsFetch<AttendanceMonth>(`/attendance?memberId=${memberId}&month=${month}`),
    enabled: Boolean(memberId),
  });

  async function download() {
    setError(null);
    try {
      const text = await hrmsFetchText(`/attendance/report?month=${month}`);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Team attendance"
        description="Review attendance by day and inspect each person’s monthly record."
        secondaryActions={
          <Link href="/attendance" className={secondary}>
            My attendance
          </Link>
        }
      />

      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="space-y-1.5 text-sm font-medium text-fg">
          Day
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg sm:w-auto"
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-fg">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="block min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg sm:w-auto"
          />
        </label>
        <button type="button" onClick={download} className={secondary}>
          Download CSV
        </button>
      </div>
      {error && <ErrorState title="Could not download attendance" message={error} />}

      {day.isLoading && (
        <div className="space-y-2" aria-label="Loading team attendance">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      )}
      {day.error && (
        <ErrorState
          title="Could not load team attendance"
          message={message(day.error)}
          onRetry={() => void day.refetch()}
        />
      )}
      {day.data && (
        <>
          {day.data.items.length === 0 ? (
            <EmptyState
              title="No attendance records"
              description="No one has an attendance record for this date."
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-fg-muted">
                    <tr>
                      <th className="p-3">{day.data.date}</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">In</th>
                      <th className="p-3">Out</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {day.data.items.map((r) => (
                      <tr key={r.memberId} className="border-t border-border">
                        <td className="p-3">
                          {r.fullName} <span className="text-xs text-fg-muted">({r.role})</span>
                        </td>
                        <td className="p-3">
                          <StatusPill status={r.status} />
                          {r.autoCheckedOut && (
                            <span className="ml-2 text-xs text-danger-fg">Missing check-out</span>
                          )}
                        </td>
                        <td className="p-3">{time(r.checkInAt)}</td>
                        <td className="p-3">{time(r.checkOutAt)}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setMemberId(r.memberId)}
                            className="text-sm text-primary hover:underline"
                          >
                            Month
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 lg:hidden">
                {day.data.items.map((r) => (
                  <article
                    key={r.memberId}
                    className="min-w-0 rounded-card border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-fg">{r.fullName}</p>
                        <p className="mt-1 text-xs text-fg-muted">{r.role}</p>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    {r.autoCheckedOut && (
                      <p className="mt-2 text-xs text-danger-fg">Missing check-out</p>
                    )}
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                      <div>
                        <dt className="text-xs text-fg-muted">In</dt>
                        <dd className="mt-0.5 tabular-nums text-fg">{time(r.checkInAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Out</dt>
                        <dd className="mt-0.5 tabular-nums text-fg">{time(r.checkOutAt)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => setMemberId(r.memberId)}
                      className="mt-4 min-h-10 text-sm font-medium text-primary hover:underline"
                    >
                      View month
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {memberId && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-fg">
            {day.data?.items.find((i) => i.memberId === memberId)?.fullName} · {month}
          </h2>
          {person.data && (
            <MonthTable
              days={person.data.days}
              corrections={person.data.corrections}
              todayDate={person.data.todayDate}
            />
          )}
        </section>
      )}
    </PageShell>
  );
}

export default function TeamAttendancePage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager']}>
      <TeamAttendance />
    </RoleGate>
  );
}
