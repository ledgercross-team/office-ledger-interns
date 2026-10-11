'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AttendanceStatus } from '@/components/attendance-status';
import { CorrectionDialog } from '@/components/correction-dialog';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage, formatTime } from '@/lib/format';
import type { TeamAttendanceRow } from '@/lib/types';

function TeamAttendance() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [editing, setEditing] = useState<TeamAttendanceRow | null>(null);

  const query = useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () =>
      apiFetch<{ timezone: string; items: TeamAttendanceRow[] }>(`/attendance${buildQuery({ date })}`),
    enabled: date !== '',
  });

  const timezone = query.data?.timezone;

  // Admins correct managers and employees; managers correct employees only.
  const canCorrect = (row: TeamAttendanceRow) =>
    row.record !== null && (user?.role === 'admin' || row.role === 'employee');

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Team attendance</h1>

      <div className="space-y-1">
        <label htmlFor="date" className="block text-sm font-medium">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded border bg-background px-3 py-2"
        />
      </div>

      {query.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="text-sm text-neutral-500">No people to show.</p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Check in</th>
                <th className="py-2 pr-4">Check out</th>
                <th className="py-2 pr-4">Note</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.userId} className="border-b">
                  <td className="py-2 pr-4">{row.userFullName}</td>
                  <td className="py-2 pr-4 capitalize">{row.role}</td>
                  <td className="py-2 pr-4">
                    <AttendanceStatus status={row.status} />
                  </td>
                  <td className="py-2 pr-4">
                    {row.checkInAt ? formatTime(row.checkInAt, timezone) : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    {row.checkOutAt ? formatTime(row.checkOutAt, timezone) : '—'}
                  </td>
                  <td className="py-2 pr-4">{row.record?.note ?? ''}</td>
                  <td className="py-2">
                    {canCorrect(row) && (
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Correct
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {timezone && <p className="text-xs text-neutral-500">Times are in {timezone}.</p>}

      {editing?.record && timezone && (
        <CorrectionDialog
          record={editing.record}
          personName={editing.userFullName}
          timezone={timezone}
          onClose={() => setEditing(null)}
        />
      )}
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
