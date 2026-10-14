'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { message, MonthTable, StatusPill, time } from '@/components/hrms/attendance-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import { hrmsFetch, hrmsFetchText } from '@/lib/hrms/api-client';
import type { AttendanceMonth, TeamAttendanceDay } from '@/lib/hrms/types';

const secondary = 'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60';

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
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-charcoal">Team attendance</h1>
        <Link href="/attendance" className="text-sm text-forest hover:underline">
          My attendance
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm text-charcoal">
          Day
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm text-charcoal">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="block rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
          />
        </label>
        <button type="button" onClick={download} className={secondary}>
          Download CSV
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}

      {day.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {day.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {message(day.error)}
        </p>
      )}
      {day.data && (
        <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-charcoal-soft">
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
                <tr key={r.memberId} className="border-t border-charcoal/10">
                  <td className="p-3">
                    {r.fullName} <span className="text-xs text-charcoal-soft">({r.role})</span>
                  </td>
                  <td className="p-3">
                    <StatusPill status={r.status} />
                    {r.autoCheckedOut && <span className="ml-2 text-xs text-alert-deep">Missing check-out</span>}
                  </td>
                  <td className="p-3">{time(r.checkInAt)}</td>
                  <td className="p-3">{time(r.checkOutAt)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setMemberId(r.memberId)}
                      className="text-xs text-forest hover:underline"
                    >
                      Month
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {memberId && (
        <section className="space-y-2">
          <h2 className="font-medium text-charcoal">
            {day.data?.items.find((i) => i.memberId === memberId)?.fullName} · {month}
          </h2>
          {person.data && <MonthTable days={person.data.days} corrections={person.data.corrections} />}
        </section>
      )}
    </>
  );
}

export default function TeamAttendancePage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager']}>
      <TeamAttendance />
    </RoleGate>
  );
}
