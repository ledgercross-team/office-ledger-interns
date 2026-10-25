'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHrmsAuth } from './auth-context';

export function HrmsRealtimeSync() {
  const queryClient = useQueryClient();
  const { session } = useHrmsAuth();
  const scope = session?.org?.id ?? (session?.role === 'gameMaster' ? 'platform' : null);

  useEffect(() => {
    if (!scope) return;
    const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
    const events = new EventSource(`${base}/events`, { withCredentials: true });
    let opened = false;
    const refresh = () =>
      void queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'hrms' &&
          ['messages', 'notifications', 'nav-counts'].includes(String(queryKey[1])),
      });
    events.onopen = () => {
      if (opened) refresh();
      opened = true;
    };
    events.onmessage = ({ data }) => {
      if (JSON.parse(data).type !== 'refresh') return;
      refresh();
    };
    return () => events.close();
  }, [scope, queryClient]);

  return null;
}
