'use client';

import { Pagination } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDateTime } from '@/lib/hrms/time';
import type { EmailPref, NotificationsPage } from '@/lib/hrms/types';

const secondary =
  'rounded-full border border-border-strong bg-surface px-4 py-1.5 text-sm font-medium transition-[background-color,transform] hover:bg-surface-sunken active:scale-95 disabled:opacity-60';

const LINKS: Record<string, string> = {
  requests: '/requests',
  tasks: '/tasks',
  project_invites: '/invites',
  reports: '/messages',
};

function EmailPrefs() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const prefs = useQuery({
    queryKey: ['hrms', 'email-prefs'],
    queryFn: () => hrmsFetch<{ items: EmailPref[] }>('/notifications/email-prefs'),
  });
  const save = useMutation({
    mutationFn: (p: { kind: string; muted: boolean }) =>
      hrmsFetch('/notifications/email-prefs', { method: 'PUT', body: { prefs: [p] } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'email-prefs'] }),
    onError: (e) => setError(e instanceof HrmsApiError ? e.message : 'Something went wrong.'),
  });
  return (
    <section className="space-y-2 rounded-card border border-border bg-surface p-4">
      <h2 className="font-medium text-fg">Email</h2>
      <p className="text-xs text-fg-muted">
        Requests waiting for your decision are always emailed. Everything else you can mute.
      </p>
      {prefs.data?.items.map((p) => (
        <label key={p.kind} className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={!p.muted}
            disabled={!p.canMute || save.isPending}
            onChange={(e) => save.mutate({ kind: p.kind, muted: !e.target.checked })}
          />
          {p.label}
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
    </section>
  );
}

export default function NotificationsPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['hrms', 'notifications', session?.activeMemberId, page],
    queryFn: () => hrmsFetch<NotificationsPage>(`/notifications?page=${page}&pageSize=25`),
    enabled: Boolean(session?.activeMemberId),
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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-fg">Notifications</h1>
        <button
          type="button"
          disabled={readAll.isPending || !list.data?.unread}
          onClick={() => readAll.mutate()}
          className={secondary}
        >
          Mark all read
        </button>
      </div>
      {list.data && list.data.items.length === 0 && (
        <p className="text-sm text-fg-muted">Nothing yet.</p>
      )}
      <ul className="space-y-2">
        {list.data?.items.map((n) => {
          const href = n.entityTable ? LINKS[n.entityTable] : undefined;
          return (
            <li
              key={n.id}
              className={`space-y-1 rounded-card border p-4 ${
                n.readAt ? 'border-border bg-surface' : 'border-primary/30 bg-primary-soft/50'
              }`}
            >
              <p className="text-sm font-medium text-fg">{n.title}</p>
              {n.body && <p className="text-sm text-fg">{n.body}</p>}
              <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                <span>{formatDateTime(n.createdAt)}</span>
                {href && (
                  <Link href={href} className="text-primary hover:underline">
                    Open
                  </Link>
                )}
                {!n.readAt && (
                  <button
                    type="button"
                    onClick={() => read.mutate(n.id)}
                    className="text-primary hover:underline"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.data && (
        <Pagination
          page={page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPage={setPage}
        />
      )}
      <EmailPrefs />
    </>
  );
}
