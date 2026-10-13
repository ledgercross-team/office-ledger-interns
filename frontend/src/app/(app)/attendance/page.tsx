'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AttendanceStatus } from '@/components/attendance-status';
import { Pagination } from '@/components/pagination';
import { Reveal } from '@/components/reveal';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage, formatDate, formatTime, todayIn } from '@/lib/format';
import type { AttendanceDay } from '@/lib/types';

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function MyAttendance() {
  const { user } = useAuth();
  const today = todayIn(user?.companyTimezone);
  const from = addDays(today, -9);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const history = useQuery({
    queryKey: ['attendance', 'me', { from, to: today }],
    queryFn: () =>
      apiFetch<{ timezone: string; items: AttendanceDay[] }>(`/attendance/me${buildQuery({ from, to: today })}`),
    enabled: Boolean(user),
  });

  const timezone = history.data?.timezone;
  const items = history.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold text-charcoal">Attendance</h1>

      <Reveal>
      <section aria-label="Last 10 days" className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-5">
        <h2 className="font-semibold text-charcoal">Last 10 days</h2>
        {history.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {history.error && (
          <p role="alert" className="text-sm text-alert-deep">
            {errorMessage(history.error)}
          </p>
        )}
        {history.data && items.length === 0 && (
          <p className="text-sm text-charcoal-soft">No attendance to show yet.</p>
        )}
        {history.data && items.length > 0 && (
          <div className="slim-scroll max-w-full overflow-x-auto">
          <table className="min-w-[36rem] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal/10 text-charcoal-soft">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Check in</th>
                <th className="py-2 pr-4 font-medium">Check out</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {visibleItems.map((day) => (
                <tr key={day.workDate} className="transition-colors hover:bg-mist/50">
                  <td className="py-2 pr-4">{formatDate(day.workDate)}</td>
                  <td className="py-2 pr-4">
                    <AttendanceStatus status={day.status} />
                  </td>
                  <td className="py-2 pr-4">
                    {day.checkInAt ? formatTime(day.checkInAt, timezone) : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    {day.checkOutAt ? formatTime(day.checkOutAt, timezone) : '—'}
                  </td>
                  <td className="py-2 text-charcoal-soft">{day.record?.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {items.length > 0 && (
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={items.length}
            onPage={setPage}
            onPageSize={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
            pageSizeId="attendance-page-size"
          />
        )}
      </section>
      </Reveal>

    </div>
  );
}

export default function AttendancePage() {
  return (
    <RoleGate allow={['manager', 'employee']}>
      <MyAttendance />
    </RoleGate>
  );
}
