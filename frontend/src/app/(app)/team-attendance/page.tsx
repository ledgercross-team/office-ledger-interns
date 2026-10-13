'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AttendanceStatus } from '@/components/attendance-status';
import { CorrectionDialog } from '@/components/correction-dialog';
import { DateInput } from '@/components/date-input';
import { Reveal } from '@/components/reveal';
import { RoleGate } from '@/components/role-gate';
import { AttendanceBars, AttendanceSpotlight, RateDonut, StoryChapter } from '@/components/story';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage, formatTime, MAX_DATE, MIN_DATE, todayIn } from '@/lib/format';
import type { AttendanceCounts, TeamAttendanceRow } from '@/lib/types';

const PAGE_SIZE_OPTIONS = [5, 10] as const;

function TeamAttendance() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => todayIn(user?.companyTimezone));
  const [editing, setEditing] = useState<TeamAttendanceRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () =>
      apiFetch<{ timezone: string; items: TeamAttendanceRow[] }>(`/attendance${buildQuery({ date })}`),
    enabled: date !== '',
  });

  const timezone = query.data?.timezone;
  const items = query.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const firstItem = (currentPage - 1) * pageSize;
  const visibleItems = items.slice(firstItem, currentPage * pageSize);
  const firstShown = items.length === 0 ? 0 : firstItem + 1;
  const lastShown = Math.min(currentPage * pageSize, items.length);
  const counts: AttendanceCounts = {
    total: items.length,
    present: items.filter((row) => row.status === 'present').length,
    late: items.filter((row) => row.status === 'late').length,
    absent: items.filter((row) => row.status === 'absent').length,
  };
  const rate = items.length === 0 ? 0 : Math.round(((counts.present + counts.late) / items.length) * 100);
  const spotlight = items
    .filter((row) => row.status === 'late' || row.status === 'absent')
    .slice(0, 5)
    .map((row) => ({ userId: row.userId, userFullName: row.userFullName, status: row.status as 'late' | 'absent' }));

  // Admins edit managers and employees; managers edit employees only.
  const canEdit = (row: TeamAttendanceRow) => user?.role === 'admin' || row.role === 'employee';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold text-charcoal">Team attendance</h1>
        <div className="space-y-1">
          <label htmlFor="date" className="block text-sm font-medium text-charcoal">
            Date
          </label>
          <DateInput
            id="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-charcoal/15 bg-white text-charcoal outline-none sm:w-44"
          />
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}

      {query.data && items.length > 0 && (
        <StoryChapter step="The day at a glance" title={`${counts.present + counts.late} of ${counts.total} checked in`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <RateDonut rate={rate} label="of the team checked in (on time or late)." />
              <AttendanceBars attendance={counts} />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold tracking-wide text-charcoal-soft uppercase">
                Needs attention
              </h3>
              <AttendanceSpotlight rows={spotlight} />
            </div>
          </div>
        </StoryChapter>
      )}

      {query.data && items.length === 0 && !query.isLoading && (
        <p className="text-sm text-charcoal-soft">No people to show.</p>
      )}

      {items.length > 0 && (
        <Reveal>
          <div className="max-w-full overflow-x-auto rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
            <table className="min-w-[48rem] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-charcoal/10 bg-offwhite text-charcoal-soft">
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Check in</th>
                  <th className="px-4 py-2.5 font-medium">Check out</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/5">
                {visibleItems.map((row) => (
                  <tr key={row.userId} className="transition-colors hover:bg-mist/50">
                    <td className="px-4 py-2.5 font-medium text-charcoal">{row.userFullName}</td>
                    <td className="px-4 py-2.5 capitalize text-charcoal-soft">{row.role}</td>
                    <td className="px-4 py-2.5">
                      <AttendanceStatus status={row.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.checkInAt ? formatTime(row.checkInAt, timezone) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.checkOutAt ? formatTime(row.checkOutAt, timezone) : '—'}
                    </td>
                    <td className="max-w-48 truncate px-4 py-2.5 text-charcoal-soft">{row.record?.note ?? ''}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit(row) && (
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          className="rounded-lg border border-charcoal/15 px-2.5 py-1 text-xs font-medium text-charcoal hover:bg-mist"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}
      {items.length > 0 && (
        <TeamAttendancePagination
          page={currentPage}
          pageSize={pageSize}
          total={items.length}
          firstShown={firstShown}
          lastShown={lastShown}
          totalPages={totalPages}
          onPage={setPage}
          onPageSize={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
        />
      )}

      {editing && timezone && (
        <CorrectionDialog
          record={editing.record}
          userId={editing.userId}
          workDate={editing.workDate}
          personName={editing.userFullName}
          timezone={timezone}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TeamAttendancePagination({
  page,
  pageSize,
  total,
  firstShown,
  lastShown,
  totalPages,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  firstShown: number;
  lastShown: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-charcoal/10 pt-4">
      <div>
        <p className="text-sm font-medium text-charcoal">
          Showing {firstShown}–{lastShown} of {total}
        </p>
        <p className="text-xs text-charcoal-soft">Adjust the page size or move through the result set.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="team-attendance-page-size" className="font-medium text-charcoal">
          Page size
        </label>
        <select
          id="team-attendance-page-size"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 outline-none focus:border-evergreen"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} rows
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Previous team attendance page"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ <span className="sr-only">Previous</span>
        </button>
        <span className="rounded-lg bg-evergreen px-3 py-1.5 font-medium text-white" aria-current="page">
          {page}
        </span>
        <button
          type="button"
          aria-label="Next team attendance page"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Next</span> ›
        </button>
      </div>
    </div>
  );
}

export default function TeamAttendancePage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <TeamAttendance />
    </RoleGate>
  );
}
