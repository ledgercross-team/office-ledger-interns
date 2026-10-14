'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { NotificationsPage } from '@/lib/hrms/types';

export function NotificationBell() {
  const { session } = useHrmsAuth();
  const data = useQuery({
    queryKey: ['hrms', 'notifications', 'bell', session?.activeMemberId],
    queryFn: () => hrmsFetch<NotificationsPage>('/notifications?pageSize=1'),
    enabled: Boolean(session?.activeMemberId),
    refetchInterval: 60_000,
  });
  const unread = data.data?.unread ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm text-charcoal hover:bg-mist/60"
    >
      Alerts
      {unread > 0 && (
        <span className="ml-1 rounded-full bg-evergreen px-1.5 py-0.5 text-xs font-medium text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
