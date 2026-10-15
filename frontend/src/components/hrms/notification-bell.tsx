'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Popover } from 'radix-ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDateTime } from '@/lib/hrms/time';
import { cn } from '@/lib/cn';
import type { NotificationsPage } from '@/lib/hrms/types';

const LINKS: Record<string, string> = {
  requests: '/requests',
  tasks: '/tasks',
  project_invites: '/invites',
  reports: '/messages',
};

/**
 * Bell with the unread count. Opens a dropdown of the latest notifications;
 * "View all" goes to the full notifications page.
 */
export function NotificationBell() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const data = useQuery({
    queryKey: ['hrms', 'notifications', 'bell', session?.activeMemberId],
    queryFn: () => hrmsFetch<NotificationsPage>('/notifications?pageSize=8'),
    enabled: Boolean(session?.activeMemberId),
    refetchInterval: 60_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'notifications'] });
  const read = useMutation({
    mutationFn: (id: string) => hrmsFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => hrmsFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: refresh,
  });
  const unread = data.data?.unread ?? 0;
  const items = data.data?.items ?? [];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-border-strong bg-surface px-2 text-fg transition-[background-color,transform] duration-150 hover:bg-surface-sunken active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none"
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-fg"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="motion-scale-in z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-border bg-surface-raised text-fg shadow-float"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-bold">Notifications</p>
            <button
              type="button"
              disabled={unread === 0 || readAll.isPending}
              onClick={() => readAll.mutate()}
              className="rounded-full px-2 py-1 text-xs font-medium text-primary hover:bg-surface-sunken disabled:text-fg-subtle disabled:hover:bg-transparent"
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-[min(24rem,60vh)] divide-y divide-border overflow-y-auto slim-scroll">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-fg-muted">Nothing yet.</li>
            )}
            {items.map((n) => {
              const href = (n.entityTable && LINKS[n.entityTable]) || '/notifications';
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    onClick={() => {
                      if (!n.readAt) read.mutate(n.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/70',
                      !n.readAt && 'bg-primary-soft/40',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body && (
                        <span className="block truncate text-sm text-fg-muted">{n.body}</span>
                      )}
                      <span className="block text-xs text-fg-subtle">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-3 text-center text-sm font-bold hover:bg-surface-sunken/70"
          >
            View all notifications
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
