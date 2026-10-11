'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Reveal } from '@/components/reveal';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, formatTime } from '@/lib/format';
import type { DashboardToday } from '@/lib/types';

const STATUS_TEXT = { present: 'Present', late: 'Late', absent: 'Absent' } as const;

export function CheckInCard({ today, timezone }: { today: DashboardToday; timezone?: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const punch = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') =>
      apiFetch(`/attendance/${kind}`, { method: 'POST' }),
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
      ]);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const checkedIn = today.checkInAt !== null;
  const checkedOut = today.checkOutAt !== null;

  return (
    <Reveal>
      <section
        aria-label="Today"
        className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-5 shadow-[0_1px_2px_rgba(28,43,37,0.06)]"
      >
        <h2 className="font-semibold text-charcoal">Today · {formatDate(today.workDate)}</h2>

        <p className="text-sm text-charcoal-soft">
          {!checkedIn && 'You have not checked in yet.'}
          {checkedIn && today.checkInAt && (
            <>
              Checked in at {formatTime(today.checkInAt, timezone)}
              {today.status && today.status !== 'absent' && ` (${STATUS_TEXT[today.status]})`}.
            </>
          )}{' '}
          {checkedOut && today.checkOutAt && `Checked out at ${formatTime(today.checkOutAt, timezone)}.`}
        </p>

        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}

        {!checkedIn && (
          <HoldButton
            label="Hold to check in"
            holdingLabel="Keep holding…"
            busy={punch.isPending}
            onHold={() => punch.mutate('check-in')}
          />
        )}
        {checkedIn && !checkedOut && (
          <HoldButton
            label="Hold to check out"
            holdingLabel="Keep holding…"
            busy={punch.isPending}
            onHold={() => punch.mutate('check-out')}
          />
        )}
        {checkedIn && checkedOut && <p className="text-sm text-charcoal-soft">Done for today.</p>}
      </section>
    </Reveal>
  );
}
