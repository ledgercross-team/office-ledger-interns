'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, formatTime } from '@/lib/format';
import type { DashboardToday } from '@/lib/types';

const STATUS_TEXT = { present: 'Present', late: 'Late', absent: 'Absent' } as const;

export function CheckInCard({ today }: { today: DashboardToday }) {
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
    <section aria-label="Today" className="space-y-2 rounded-lg border p-4">
      <h2 className="font-semibold">Today · {formatDate(today.workDate)}</h2>

      <p className="text-sm">
        {!checkedIn && 'You have not checked in yet.'}
        {checkedIn && today.checkInAt && (
          <>
            Checked in at {formatTime(today.checkInAt)}
            {today.status && today.status !== 'absent' && ` (${STATUS_TEXT[today.status]})`}.
          </>
        )}{' '}
        {checkedOut && today.checkOutAt && `Checked out at ${formatTime(today.checkOutAt)}.`}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!checkedIn && (
        <button
          type="button"
          disabled={punch.isPending}
          onClick={() => punch.mutate('check-in')}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          Check in
        </button>
      )}
      {checkedIn && !checkedOut && (
        <button
          type="button"
          disabled={punch.isPending}
          onClick={() => punch.mutate('check-out')}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          Check out
        </button>
      )}
      {checkedIn && checkedOut && <p className="text-sm text-neutral-500">Done for today.</p>}
    </section>
  );
}
