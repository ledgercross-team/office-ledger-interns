'use client';

import { useQuery } from '@tanstack/react-query';
import { AttendanceStatus } from '@/components/attendance-status';
import { CheckInCard } from '@/components/check-in-card';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, formatTime } from '@/lib/format';
import type { AttendanceDay, DashboardSummary } from '@/lib/types';

function MyAttendance() {
  // Same query as the dashboard, so the check-in card stays in sync with it.
  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
  });
  const history = useQuery({
    queryKey: ['attendance', 'me'],
    queryFn: () => apiFetch<{ timezone: string; items: AttendanceDay[] }>('/attendance/me'),
  });

  const timezone = history.data?.timezone ?? summary.data?.timezone;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Attendance</h1>

      {summary.data?.today && <CheckInCard today={summary.data.today} timezone={timezone} />}

      <section aria-label="Last 30 days" className="space-y-2">
        <h2 className="font-semibold">Last 30 days</h2>
        {history.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {history.error && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(history.error)}
          </p>
        )}
        {history.data && history.data.items.length === 0 && (
          <p className="text-sm text-neutral-500">No attendance to show yet.</p>
        )}
        {history.data && history.data.items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Check in</th>
                <th className="py-2 pr-4">Check out</th>
                <th className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {history.data.items.map((day) => (
                <tr key={day.workDate} className="border-b">
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
                  <td className="py-2">{day.record?.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {timezone && <p className="text-xs text-neutral-500">Times are in {timezone}.</p>}
      </section>
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
