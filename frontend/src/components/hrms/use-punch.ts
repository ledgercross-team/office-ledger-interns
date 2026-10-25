'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { hrmsFetch, HrmsApiError } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { AttendanceMe } from '@/lib/hrms/types';

/**
 * Today's attendance plus check in / check out. `punch` rejects when the
 * server refuses (for example off the office network), so a caller can show
 * "done" only when it really happened; the server's message is kept in `error`.
 */
export function usePunch() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const month = new Date().toISOString().slice(0, 7);
  const me = useQuery({
    queryKey: ['hrms', 'attendance', 'today', session?.activeMemberId],
    queryFn: () => hrmsFetch<AttendanceMe>(`/attendance/me?month=${month}`),
    enabled: session?.activeMemberId != null,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') =>
      hrmsFetch(`/attendance/${kind}`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'attendance'] });
    },
    onError: (err) =>
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      ),
  });

  const checkedIn = me.data?.today.checkInAt != null;
  const checkedOut = me.data?.today.checkOutAt != null;
  return {
    me,
    today: me.data?.today,
    checkedIn,
    checkedOut,
    pending: mutation.isPending,
    error,
    clearError: () => setError(null),
    punch: (kind: 'check-in' | 'check-out') => mutation.mutateAsync(kind),
  };
}
