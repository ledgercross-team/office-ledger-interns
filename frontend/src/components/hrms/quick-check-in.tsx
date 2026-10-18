'use client';

import { LogIn, LogOut } from 'lucide-react';
import { Button, Popover } from '@/components/ui';
import { HoldButton } from './hold-button';
import { useReadOnly } from './read-only';
import { usePunch } from './use-punch';
import { formatTime } from '@/lib/hrms/time';

/**
 * Quick check-in button for the top bar. Shows Check in / Check out /
 * Checked out + time. Failures (for example off the office network) show
 * the server message word for word.
 */
export function QuickCheckIn() {
  const readOnly = useReadOnly();
  const { me: today, checkedIn, checkedOut, pending, error, punch } = usePunch();

  const label = !checkedIn
    ? 'Check in'
    : checkedOut
      ? `Checked out ${formatTime(today.data?.today.checkOutAt ?? null)}`
      : 'Check out';
  const Icon = checkedIn && !checkedOut ? LogOut : LogIn;

  return (
    <Popover
      trigger={
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={today.isLoading}
          aria-label={label}
        >
          <Icon aria-hidden className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      }
      title="Today's attendance"
    >
      <div className="min-w-56 space-y-3 text-sm">
        {today.isLoading && <p className="text-fg-muted">Loading…</p>}
        {today.error && (
          <p role="alert" className="text-danger-fg">
            Could not load today&apos;s attendance.
          </p>
        )}
        {today.data && (
          <dl className="space-y-1 tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">In</dt>
              <dd className="font-medium">{formatTime(today.data.today.checkInAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Out</dt>
              <dd className="font-medium">{formatTime(today.data.today.checkOutAt)}</dd>
            </div>
          </dl>
        )}
        {error && (
          <p role="alert" className="rounded-control bg-danger-soft p-2 text-danger-fg">
            {error}
          </p>
        )}
        <p className="text-center text-xs text-fg-muted">Press and hold for 2.5 seconds.</p>
        <div className="flex justify-center pt-1">
          {!checkedIn && (
            <HoldButton
              className="min-h-12 px-8 text-base"
              busy={pending}
              disabled={readOnly.readOnly}
              disabledReason={readOnly.reason ?? undefined}
              onHold={() => punch('check-in')}
            >
              Hold to check in
            </HoldButton>
          )}
          {checkedIn && !checkedOut && (
            <HoldButton
              className="min-h-12 px-8 text-base"
              busy={pending}
              disabled={readOnly.readOnly}
              disabledReason={readOnly.reason ?? undefined}
              onHold={() => punch('check-out')}
            >
              Hold to check out
            </HoldButton>
          )}
          {checkedOut && <p className="text-center text-fg-muted">Done for today.</p>}
        </div>
      </div>
    </Popover>
  );
}
