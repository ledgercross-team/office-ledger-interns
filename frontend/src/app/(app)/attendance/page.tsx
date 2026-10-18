'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  CorrectionDialog,
  message,
  MonthTable,
  StatusPill,
  time,
} from '@/components/hrms/attendance-parts';
import { HoldButton } from '@/components/hrms/hold-button';
import { useReadOnly } from '@/components/hrms/read-only';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { AttendanceDayEntry, AttendanceMe, AttendanceToday } from '@/lib/hrms/types';

export default function AttendancePage() {
  const { session } = useHrmsAuth();
  const readOnly = useReadOnly();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [correcting, setCorrecting] = useState<AttendanceDayEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = ['hrms', 'attendance', session?.activeMemberId, month];
  const data = useQuery({
    queryKey: key,
    queryFn: () => hrmsFetch<AttendanceMe>(`/attendance/me?month=${month}`),
    enabled: Boolean(session?.activeMemberId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'attendance'] });

  const act = useMutation({
    mutationFn: (path: 'check-in' | 'check-out') =>
      hrmsFetch<AttendanceToday>(`/attendance/${path}`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(message(err)),
  });

  const today = data.data?.today;
  const canSeeTeam =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-charcoal">Attendance</h1>
        {canSeeTeam && (
          <Link href="/attendance/team" className="text-sm text-forest hover:underline">
            Team attendance
          </Link>
        )}
      </div>

      <section className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-charcoal">Today</span>
          <StatusPill status={today?.status ?? null} />
          <span className="text-sm text-charcoal-soft">
            In {time(today?.checkInAt ?? null)} · Out {time(today?.checkOutAt ?? null)}
          </span>
        </div>
        <div className="flex gap-2">
          {!today?.checkInAt && (
            <HoldButton
              busy={act.isPending}
              disabled={readOnly.readOnly}
              disabledReason={readOnly.reason ?? undefined}
              onHold={() => act.mutate('check-in')}
            >
              Hold to check in
            </HoldButton>
          )}
          {today?.checkInAt && !today.checkOutAt && (
            <HoldButton
              busy={act.isPending}
              disabled={readOnly.readOnly}
              disabledReason={readOnly.reason ?? undefined}
              onHold={() => act.mutate('check-out')}
            >
              Hold to check out
            </HoldButton>
          )}
        </div>
        <p className="text-xs text-charcoal-soft">
          Press and hold for 2.5 seconds. Your IP address must match an office address configured by
          a CEO or COO.
        </p>
        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
      </section>

      <label className="block space-y-1 text-sm text-charcoal">
        Month
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="block rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
        />
      </label>
      {data.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {data.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {message(data.error)}
        </p>
      )}
      {data.data && (
        <MonthTable
          days={data.data.days}
          corrections={data.data.corrections}
          todayDate={data.data.todayDate}
          onCorrect={setCorrecting}
        />
      )}
      {correcting && (
        <CorrectionDialog day={correcting} onClose={() => setCorrecting(null)} onDone={refresh} />
      )}
    </>
  );
}
