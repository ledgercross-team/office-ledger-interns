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
import {
  Banner,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  controlClass,
  labelClass,
  secondaryActionClass,
} from '@/components/ui';
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
      <PageHeader
        title={canSeeTeam ? 'Attendance' : 'My attendance'}
        description={
          canSeeTeam
            ? 'Check in from an approved office network, then review your own or your team’s record.'
            : 'Check in from an approved office network and review your working-day history.'
        }
        secondaryActions={
          canSeeTeam ? (
            <Link href="/attendance/team" className={secondaryActionClass}>
              Team attendance
            </Link>
          ) : undefined
        }
      />

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-fg">Today</span>
          <StatusPill status={today?.status ?? null} />
          <span className="text-sm text-fg-muted">
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
        <p className="text-xs text-fg-muted">
          Press and hold for 2.5 seconds. Your IP address must match an office address configured by
          a CEO or COO.
        </p>
        {error && (
          <Banner tone="danger" title="Attendance action failed">
            {error}
          </Banner>
        )}
      </Card>

      <label className={labelClass}>
        Month
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className={controlClass}
        />
      </label>
      {data.isLoading && (
        <div className="space-y-2" aria-label="Loading attendance">
          <Skeleton className="h-8 w-32" />
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20" />
          ))}
        </div>
      )}
      {data.error && (
        <ErrorState
          title="Could not load attendance"
          message={message(data.error)}
          onRetry={() => void data.refetch()}
        />
      )}
      {data.data && data.data.days.length === 0 && (
        <EmptyState
          title="No attendance days yet"
          description="Your attendance history will appear here after the first working day is recorded."
        />
      )}
      {data.data && data.data.days.length > 0 && (
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
