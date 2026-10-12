'use client';

import { useQuery } from '@tanstack/react-query';
import { AttendanceStatus } from '@/components/attendance-status';
import { PersonInsights } from '@/components/attendance-insights';
import { CheckInCard } from '@/components/check-in-card';
import { Reveal } from '@/components/reveal';
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
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold text-charcoal">Attendance</h1>

      {summary.data?.today && <CheckInCard today={summary.data.today} timezone={timezone} />}

      <Reveal>
      <section aria-label="Last 30 days" className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <h2 className="font-semibold text-charcoal">Last 30 days</h2>
        {history.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {history.error && (
          <p role="alert" className="text-sm text-alert-deep">
            {errorMessage(history.error)}
          </p>
        )}
        {history.data && history.data.items.length === 0 && (
          <p className="text-sm text-charcoal-soft">No attendance to show yet.</p>
        )}
        {history.data && history.data.items.length > 0 && (
          <table className="w-full text-left text-sm">
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
              {history.data.items.map((day) => (
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
        )}
        {timezone && <p className="text-xs text-charcoal-soft">Times are in {timezone}.</p>}
      </section>
      </Reveal>

      <section aria-label="Your tendencies" className="max-w-5xl space-y-3">
        <h2 className="text-lg font-semibold text-charcoal">Your check-in and check-out tendencies</h2>
        <PersonInsights path="/attendance/stats/me" />
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
