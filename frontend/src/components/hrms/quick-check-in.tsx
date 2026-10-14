'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button, Popover } from '@/components/ui';
import { HoldButton } from './hold-button';
import { useReadOnly } from './read-only';
import { hrmsFetch, HrmsApiError } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatTime } from '@/lib/hrms/time';
import type { AttendanceMe } from '@/lib/hrms/types';

/**
 * Quick check-in button for the top bar. Shows Check in / Check out /
 * Checked out + time. Failures (for example off the office network) show
 * the server message word for word.
 */
export function QuickCheckIn() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const readOnly = useReadOnly();

  const month = new Date().toISOString().slice(0, 7);
  const today = useQuery({
    queryKey: ['hrms', 'attendance', 'today', session?.activeMemberId],
    queryFn: () => hrmsFetch<AttendanceMe>(`/attendance/me?month=${month}`),
    enabled: session?.activeMemberId != null,
    retry: false,
  });

  const punch = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') => hrmsFetch(`/attendance/${kind}`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'attendance'] });
    },
    onError: (err) => setError(err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.'),
  });

  const checkedIn = today.data?.today.checkInAt != null;
  const checkedOut = today.data?.today.checkOutAt != null;
  const label = !checkedIn ? 'Check in' : checkedOut ? `Checked out ${formatTime(today.data?.today.checkOutAt ?? null)}` : 'Check out';
  const Icon = checkedIn && !checkedOut ? LogOut : LogIn;

  return (
    <Popover
      trigger={
        <Button variant="secondary" size="sm" loading={punch.isPending} disabled={today.isLoading}>
          <Icon aria-hidden className="size-4" />
          {label}
        </Button>
      }
      title="Today's attendance"
    >
      <div className="min-w-56 space-y-3 text-sm">
        {today.isLoading && <p className="text-fg-muted">Loading…</p>}
        {today.error && <p role="alert" className="text-danger-fg">Could not load today&apos;s attendance.</p>}
        {today.data && (
          <dl className="space-y-1 tabular-nums">
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">In</dt><dd className="font-medium">{formatTime(today.data.today.checkInAt)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">Out</dt><dd className="font-medium">{formatTime(today.data.today.checkOutAt)}</dd></div>
          </dl>
        )}
        {error && <p role="alert" className="text-danger-fg">{error}</p>}
        <p className="text-xs text-fg-muted">Press and hold for 2.5 seconds.</p>
        <div className="flex gap-2">
          {!checkedIn && (
            <HoldButton size="sm" busy={punch.isPending} disabled={readOnly.readOnly} disabledReason={readOnly.reason ?? undefined} onHold={() => punch.mutate('check-in')}>
              Hold to check in
            </HoldButton>
          )}
          {checkedIn && !checkedOut && (
            <HoldButton size="sm" busy={punch.isPending} disabled={readOnly.readOnly} disabledReason={readOnly.reason ?? undefined} onHold={() => punch.mutate('check-out')}>
              Hold to check out
            </HoldButton>
          )}
          {checkedOut && <p className="text-fg-muted">Done for today.</p>}
        </div>
      </div>
    </Popover>
  );
}
