'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { NotificationsPage } from '@/lib/hrms/types';

/**
 * Notification bell with unread count. Links to the full notifications
 * page; the dropdown of the latest 10 arrives with UI-11.
 */
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
      className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border border-border-strong bg-surface px-2 text-fg hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Bell aria-hidden className="size-4" />
      {unread > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-fg">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
