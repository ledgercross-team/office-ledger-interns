'use client';

import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  Pagination,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { formatDateTime } from '@/lib/hrms/time';
import type { EmailPref, NotificationsPage } from '@/lib/hrms/types';

const LINKS: Record<string, string> = {
  requests: '/requests',
  tasks: '/tasks',
  project_invites: '/invites',
  reports: '/messages',
};

function EmailPrefs() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const prefs = useQuery({
    queryKey: ['hrms', 'email-prefs'],
    queryFn: () => hrmsFetch<{ items: EmailPref[] }>('/notifications/email-prefs'),
  });
  const save = useMutation({
    mutationFn: (p: { kind: string; muted: boolean }) =>
      hrmsFetch('/notifications/email-prefs', { method: 'PUT', body: { prefs: [p] } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'email-prefs'] });
      toast({ title: 'Email preferences saved', tone: 'success' });
    },
    onError: (e) => setError(e instanceof HrmsApiError ? e.message : 'Something went wrong.'),
  });
  return (
    <section className="space-y-2 rounded-card border border-border bg-surface p-4">
      <h2 className="font-medium text-fg">Email</h2>
      <p className="text-xs text-fg-muted">
        Requests waiting for your decision are always emailed. Everything else you can mute.
      </p>
      {prefs.isLoading && <Skeleton className="h-8 w-full" />}
      {prefs.error && (
        <ErrorState
          title="Could not load email preferences"
          message="Try again to view your notification settings."
          onRetry={() => void prefs.refetch()}
        />
      )}
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
        <Banner tone="danger" title="Could not save email preference">
          {error}
        </Banner>
      )}
    </section>
  );
}

export default function NotificationsPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const list = useQuery({
    queryKey: ['hrms', 'notifications', session?.activeMemberId, page],
    queryFn: () => hrmsFetch<NotificationsPage>(`/notifications?page=${page}&pageSize=25`),
    enabled: Boolean(session?.activeMemberId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'notifications'] });
  const read = useMutation({
    mutationFn: (id: string) => hrmsFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof HrmsApiError ? err.message : 'Something went wrong.'),
  });
  const readAll = useMutation({
    mutationFn: () => hrmsFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      refresh();
      toast({ title: 'Notifications marked as read', tone: 'success' });
    },
    onError: (err) => setError(err instanceof HrmsApiError ? err.message : 'Something went wrong.'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Notifications"
        description="Keep track of decisions, updates, and actions that need your attention."
        secondaryActions={
          <Button
            variant="secondary"
            disabled={readAll.isPending || !list.data?.unread}
            loading={readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            Mark all read
          </Button>
        }
      />
      {error && (
        <Banner tone="danger" title="Notification action failed">
          {error}
        </Banner>
      )}
      {list.isLoading && (
        <div className="space-y-2" aria-label="Loading notifications">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      )}
      {list.error && (
        <ErrorState
          title="Could not load notifications"
          message={
            list.error instanceof Error ? list.error.message : 'Try again to load notifications.'
          }
          onRetry={() => void list.refetch()}
        />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title="You are all caught up"
          description="New notifications will appear here."
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <ul className="space-y-2">
          {list.data.items.map((n) => {
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
      )}
      {list.data && (
        <Pagination
          page={page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPage={setPage}
        />
      )}
      <EmailPrefs />
    </PageShell>
  );
}
