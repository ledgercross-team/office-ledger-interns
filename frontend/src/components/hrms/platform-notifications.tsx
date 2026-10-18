'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Bell, Inbox, MessageSquare } from 'lucide-react';
import { Popover } from 'radix-ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import type { PlatformRequest } from '@/lib/hrms/types';

/** Header bell for the platform console: unread messages and requests waiting on a gameMaster. */
export function PlatformNotifications() {
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: ['hrms', 'messages', 'unread', 'platform'],
    queryFn: () => hrmsFetch<{ messages: number }>('/platform/messages/unread-count'),
    refetchInterval: 10_000,
    retry: false,
  });
  const requests = useQuery({
    queryKey: ['hrms', 'platform', 'requests'],
    queryFn: () => hrmsFetch<{ items: PlatformRequest[] }>('/platform/requests'),
    refetchInterval: 60_000,
    retry: false,
  });
  const messages = unread.data?.messages ?? 0;
  const waiting =
    requests.data?.items.filter((r) => r.status === 'pending' || r.status === 'verified').length ??
    0;
  const total = messages + waiting;
  const rows = [
    { href: '/platform/messages', icon: MessageSquare, count: messages, label: 'Unread messages' },
    { href: '/platform/requests', icon: Inbox, count: waiting, label: 'Requests to handle' },
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={total > 0 ? `Notifications, ${total} waiting` : 'Notifications'}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-border-strong bg-surface px-2 text-fg hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell aria-hidden className="size-4" />
        {total > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-fg"
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="motion-scale-in z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-border bg-surface-raised text-fg shadow-float"
        >
          <p className="border-b border-border px-4 py-3 font-bold">Notifications</p>
          <ul className="divide-y divide-border">
            {rows.map(({ href, icon: Icon, count, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-sunken/70"
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-fg-muted" />
                  <span className="flex-1">{label}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
