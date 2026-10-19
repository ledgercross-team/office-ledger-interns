'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, EyeOff, MessageSquarePlus, ShieldQuestion } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { MemberSearch, type MemberOption } from '@/components/hrms/member-search';
import { useReadOnly } from '@/components/hrms/read-only';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/hrms/time';
import type {
  MessageThreadDetail,
  MessageThreadSummary,
  ReportDetail,
  ReportSummary,
} from '@/lib/hrms/types';

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  coo: 'COO',
  manager: 'Manager',
  employee: 'Employee',
  gameMaster: 'Platform team',
};

// No push channel: an open conversation is asked again every 5 seconds, lists every 10.
const THREAD_REFRESH_MS = 5_000;
const LIST_REFRESH_MS = 10_000;

const fail = (err: unknown) =>
  err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.';

type Mode = 'org' | 'platform';
type Tab = 'conversations' | 'reports';

function Bubble({ mine, body, at }: { mine: boolean; body: string; at: string | null }) {
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm',
          mine ? 'bg-primary text-primary-fg' : 'border border-border bg-surface-raised text-fg',
        )}
      >
        {body}
        <p
          className={cn(
            'mt-1 text-[11px] tabular-nums',
            mine ? 'text-primary-fg/80' : 'text-fg-muted',
          )}
        >
          {formatDateTime(at)}
        </p>
      </div>
    </li>
  );
}

/** Message box: Enter sends, Shift+Enter makes a new line. */
function Composer({
  onSend,
  pending,
  disabled,
  disabledReason,
  label = 'Message',
}: {
  onSend: (body: string) => Promise<void>;
  pending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const body = text.trim();
    if (!body || pending || disabled) return;
    setError(null);
    try {
      await onSend(body);
      setText('');
    } catch (err) {
      setError(fail(err));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void send();
      }}
      className="space-y-2"
    >
      <Textarea
        label={label}
        rows={3}
        maxLength={4000}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        helperText="Enter to send, Shift+Enter for a new line."
      />
      {error && <ErrorState title="Could not send" message={error} />}
      <Button
        type="submit"
        loading={pending}
        disabled={disabled || text.trim().length === 0}
        disabledReason={disabled ? disabledReason : undefined}
      >
        Send
      </Button>
    </form>
  );
}

// ---- one conversation -------------------------------------------------------
function ThreadView({ mode, id, onBack }: { mode: Mode; id: string; onBack: () => void }) {
  const base = mode === 'platform' ? '/platform/messages' : '/messages';
  const queryClient = useQueryClient();
  const readOnly = useReadOnly();
  const endRef = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: ['hrms', 'messages', 'thread', mode, id],
    queryFn: () => hrmsFetch<MessageThreadDetail>(`${base}/threads/${id}`),
    refetchInterval: THREAD_REFRESH_MS,
  });

  const unreadFromOther = (thread.data?.messages ?? []).some((m) => !m.mine && m.readAt === null);
  const markRead = useMutation({
    mutationFn: () => hrmsFetch(`${base}/threads/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] }),
  });
  useEffect(() => {
    if (unreadFromOther && !markRead.isPending) markRead.mutate();
    // Marking read is a reaction to new unread messages arriving, not to the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadFromOther, id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.data?.messages.length]);

  const send = useMutation({
    mutationFn: (body: string) =>
      hrmsFetch(`${base}/threads/${id}/reply`, { method: 'POST', body: { body } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] }),
  });
  const hide = useMutation({
    mutationFn: (messageId: string) =>
      hrmsFetch(`/messages/hide/${messageId}`, { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] }),
  });

  if (thread.isLoading) return <Skeleton className="h-64 w-full" />;
  if (thread.error || !thread.data) {
    return <ErrorState message={fail(thread.error)} onRetry={() => void thread.refetch()} />;
  }
  const t = thread.data;
  return (
    <div className="flex min-h-[30rem] min-w-0 flex-col gap-4 rounded-card border border-border bg-surface-raised p-4 sm:p-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Back to conversations"
          onClick={onBack}
          className="md:hidden"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-fg">{t.otherName}</h2>
          <p className="truncate text-xs text-fg-muted">
            {t.otherRole ? (ROLE_LABELS[t.otherRole] ?? t.otherRole) : 'No longer active'}
            {t.orgName ? ` · ${t.orgName}` : ''}
          </p>
        </div>
      </div>
      <ul
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-card border border-border bg-surface-sunken p-3 sm:p-4"
        aria-live="polite"
        aria-label="Messages"
      >
        {t.messages.length === 0 && (
          <li>
            <EmptyState title="No messages yet" description="Start the conversation below." />
          </li>
        )}
        {t.messages.map((m) => (
          <div key={m.id} className="group">
            <Bubble mine={m.mine} body={m.body} at={m.sentAt} />
            {mode === 'org' && (
              <div className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                <button
                  type="button"
                  onClick={() => hide.mutate(m.id)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fg-muted opacity-0 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <EyeOff aria-hidden className="size-3" /> Hide for me
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </ul>
      <div className="border-t border-border pt-4">
        {t.closed ? (
          <Banner tone="info" title="This conversation is closed.">
            The other person is no longer active in this organisation.
          </Banner>
        ) : (
          <Composer
            pending={send.isPending}
            onSend={async (body) => {
              await send.mutateAsync(body);
            }}
            disabled={mode === 'org' && readOnly.readOnly && t.otherRole !== 'gameMaster'}
            disabledReason={readOnly.reason ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

// ---- start a conversation -------------------------------------------------------
function NewMessage({
  mode,
  onStarted,
  onCancel,
}: {
  mode: Mode;
  onStarted: (id: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState<MemberOption | null>(null);
  // For a gameMaster the organisation travels with the person they picked.
  const orgByUser = useRef(new Map<string, string>());

  const fetchOptions = async (q: string): Promise<MemberOption[]> => {
    if (mode === 'platform') {
      const r = await hrmsFetch<{
        items: Array<{
          orgId: string;
          orgName: string;
          userId: string;
          fullName: string;
          role: string;
        }>;
      }>(`/platform/messages/contacts?q=${encodeURIComponent(q)}`);
      return r.items.map((c) => {
        orgByUser.current.set(c.userId, c.orgId);
        return { id: c.userId, fullName: c.fullName, role: c.role, email: c.orgName };
      });
    }
    const r = await hrmsFetch<{ items: Array<{ userId: string; fullName: string; role: string }> }>(
      `/messages/recipients?q=${encodeURIComponent(q)}`,
    );
    return r.items.map((c) => ({
      id: c.userId,
      fullName: c.fullName,
      role: ROLE_LABELS[c.role] ?? c.role,
    }));
  };

  const start = useMutation({
    mutationFn: (body: string) =>
      hrmsFetch<{ conversationId: string }>(
        mode === 'platform' ? '/platform/messages/threads' : '/messages/threads',
        {
          method: 'POST',
          body:
            mode === 'platform'
              ? { orgId: orgByUser.current.get(to!.id), toUserId: to!.id, body }
              : { toUserId: to!.id, body },
        },
      ),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] });
      onStarted(r.conversationId);
    },
  });

  return (
    <Card className="min-h-[30rem] space-y-4">
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-semibold text-fg">New message</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Start a focused conversation with a platform contact.
        </p>
      </div>
      <MemberSearch
        label="To"
        required
        selected={to}
        onSelect={setTo}
        onClear={() => setTo(null)}
        fetchOptions={fetchOptions}
        searchKey={`messages-${mode}`}
        placeholder="Search a name"
      />
      <Composer
        pending={start.isPending}
        disabled={to === null}
        disabledReason="Choose who to write to first."
        onSend={async (body) => {
          await start.mutateAsync(body);
        }}
      />
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </Card>
  );
}

// ---- conversations tab ------------------------------------------------------------
function Conversations({ mode }: { mode: Mode }) {
  const base = mode === 'platform' ? '/platform/messages' : '/messages';
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const threads = useQuery({
    queryKey: ['hrms', 'messages', 'threads', mode],
    queryFn: () => hrmsFetch<{ items: MessageThreadSummary[] }>(`${base}/threads`),
    refetchInterval: LIST_REFRESH_MS,
  });

  const list = (
    <div
      className={cn(
        'min-w-0 rounded-card border border-border bg-surface-raised p-3',
        selected || composing ? 'hidden lg:block' : '',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-fg">
            {mode === 'platform' ? 'Platform inbox' : 'Inbox'}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">Your active conversations</p>
        </div>
        <MessageSquarePlus aria-hidden className="mt-0.5 size-4 text-primary" />
      </div>
      <Button
        onClick={() => {
          setComposing(true);
          setSelected(null);
        }}
        className="w-full"
      >
        New message
      </Button>
      {threads.isLoading && <Skeleton className="h-16 w-full" />}
      {threads.error && (
        <ErrorState message={fail(threads.error)} onRetry={() => void threads.refetch()} />
      )}
      {threads.data && threads.data.items.length === 0 && (
        <EmptyState title="No conversations yet" description="Start one with New message." />
      )}
      <ul className="mt-3 space-y-2">
        {threads.data?.items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                setSelected(t.id);
                setComposing(false);
              }}
              aria-current={selected === t.id ? 'true' : undefined}
              className={cn(
                'w-full rounded-card border p-3 text-left text-sm',
                selected === t.id
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:bg-surface-sunken',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-fg">{t.otherName}</span>
                {t.unread > 0 && (
                  <span
                    aria-label={`${t.unread} unread`}
                    className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-fg"
                  >
                    {t.unread}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-fg-muted">
                {t.otherRole ? (ROLE_LABELS[t.otherRole] ?? t.otherRole) : 'No longer active'}
                {t.orgName ? ` · ${t.orgName}` : ''}
              </span>
              {t.lastBody && (
                <span className="mt-1 block truncate text-fg-muted">{t.lastBody}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid min-h-[30rem] gap-4 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
      {list}
      <div className={cn('min-w-0', !selected && !composing ? 'hidden lg:block' : '')}>
        {composing ? (
          <NewMessage
            mode={mode}
            onCancel={() => setComposing(false)}
            onStarted={(id) => {
              setComposing(false);
              setSelected(id);
            }}
          />
        ) : selected ? (
          <ThreadView mode={mode} id={selected} onBack={() => setSelected(null)} />
        ) : (
          <div className="flex min-h-[30rem] items-center justify-center rounded-card border border-dashed border-border bg-surface-raised p-6">
            <EmptyState
              title="Pick a conversation"
              description="Choose one on the left, or start a new message."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- reports tab ------------------------------------------------------------------
function ReportThread({ id, asCeo, onBack }: { id: string; asCeo: boolean; onBack: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['hrms', 'messages', 'report', id],
    queryFn: () => hrmsFetch<ReportDetail>(`/reports/${id}`),
    refetchInterval: THREAD_REFRESH_MS,
  });
  const unread = (detail.data?.messages ?? []).some((m) => !m.mine && m.readAt === null);
  const read = useMutation({
    mutationFn: () => hrmsFetch(`/reports/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] }),
  });
  useEffect(() => {
    if (unread && !read.isPending) read.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, id]);

  const reply = useMutation({
    mutationFn: (body: string) =>
      hrmsFetch(`/reports/${id}/reply`, { method: 'POST', body: { body } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] }),
  });

  if (detail.isLoading) return <Skeleton className="h-64 w-full" />;
  if (detail.error || !detail.data)
    return <ErrorState message={fail(detail.error)} onRetry={() => void detail.refetch()} />;
  const d = detail.data;
  return (
    <div className="min-h-[30rem] space-y-4 rounded-card border border-border bg-surface-raised p-4 sm:p-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Back to reports"
          onClick={onBack}
          className="md:hidden"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-fg">{d.subject}</h2>
          <p className="text-xs text-fg-muted">
            {asCeo
              ? d.anonymous
                ? 'Anonymous report'
                : `Report from ${d.reporterName}`
              : d.anonymous
                ? 'Sent anonymously'
                : 'Sent with your name'}
          </p>
        </div>
      </div>
      <ul
        className="max-h-[50vh] space-y-2 overflow-y-auto rounded-card border border-border bg-surface-sunken p-3 sm:p-4"
        aria-live="polite"
      >
        {d.messages.map((m) => (
          <Bubble key={m.id} mine={m.mine} body={m.body} at={m.sentAt} />
        ))}
      </ul>
      <Composer
        label={asCeo ? 'Reply to the reporter' : 'Add to your report'}
        pending={reply.isPending}
        onSend={async (body) => {
          await reply.mutateAsync(body);
        }}
      />
    </div>
  );
}

function NewReport({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const ceos = useQuery({
    queryKey: ['hrms', 'messages', 'report-ceos'],
    queryFn: () =>
      hrmsFetch<{ items: Array<{ userId: string; fullName: string }> }>('/reports/ceos'),
  });
  const [ceoUserId, setCeoUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chosen = ceoUserId || ceos.data?.items[0]?.userId || '';

  const file = useMutation({
    mutationFn: () =>
      hrmsFetch<{ reportId: string }>('/reports', {
        method: 'POST',
        body: { ceoUserId: chosen, subject: subject.trim(), body: body.trim(), anonymous },
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'messages'] });
      onDone(r.reportId);
    },
    onError: (err) => setError(fail(err)),
  });

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-fg">Report to the CEO</h2>
      <Banner
        tone="info"
        title={anonymous ? 'Your name is hidden from the CEO.' : 'The CEO will see your name.'}
      >
        {anonymous
          ? 'It is still stored with your account so the CEO can answer you here. In a small team, what you write or when can still point to you, so leave out details only you would know.'
          : 'Use this for a private matter you are happy to put your name to.'}
      </Banner>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          file.mutate();
        }}
      >
        <label className="block space-y-1 text-sm font-medium text-fg">
          To
          <select
            value={chosen}
            onChange={(event) => setCeoUserId(event.target.value)}
            className="min-h-10 w-full rounded-control border border-border bg-surface px-3 text-sm"
          >
            {ceos.data?.items.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.fullName} (CEO)
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium text-fg">
          Subject
          <input
            required
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="min-h-10 w-full rounded-control border border-border bg-surface px-3 text-sm"
          />
        </label>
        <Textarea
          label="What happened"
          required
          rows={5}
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex items-center gap-3 rounded-control border border-border bg-surface-sunken px-3 py-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={anonymous}
            aria-label="Send anonymously"
            onClick={() => setAnonymous((v) => !v)}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
              anonymous ? 'border-primary bg-primary' : 'border-border-strong bg-surface-sunken',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out',
                anonymous ? 'translate-x-6' : 'translate-x-0.5',
              )}
            />
          </button>
          <span className="text-sm font-medium text-fg">
            {anonymous ? 'Anonymous' : 'Show my name'}
          </span>
        </div>
        {error && <ErrorState title="Could not send the report" message={error} />}
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={file.isPending}
            disabled={!chosen || !subject.trim() || !body.trim()}
          >
            Send report
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Reports({ asCeo }: { asCeo: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const list = useQuery({
    queryKey: ['hrms', 'messages', 'reports', asCeo ? 'inbox' : 'mine'],
    queryFn: () => hrmsFetch<{ items: ReportSummary[] }>(asCeo ? '/reports' : '/reports/mine'),
    refetchInterval: LIST_REFRESH_MS,
  });

  return (
    <div className="grid min-h-[30rem] gap-4 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
      <div
        className={cn(
          'min-w-0 rounded-card border border-border bg-surface-raised p-3',
          selected || composing ? 'hidden lg:block' : '',
        )}
      >
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold text-fg">Reports</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {asCeo ? 'Private reports from your team' : 'Private notes to your CEO'}
          </p>
        </div>
        {!asCeo && (
          <Button
            onClick={() => {
              setComposing(true);
              setSelected(null);
            }}
            className="w-full"
          >
            <ShieldQuestion aria-hidden className="size-4" />
            New report
          </Button>
        )}
        {list.isLoading && <Skeleton className="h-16 w-full" />}
        {list.error && (
          <ErrorState message={fail(list.error)} onRetry={() => void list.refetch()} />
        )}
        {list.data && list.data.items.length === 0 && (
          <EmptyState
            title={asCeo ? 'No reports' : 'No reports sent'}
            description={
              asCeo
                ? 'Reports sent to you by your team appear here.'
                : 'Use New report to raise a private matter with the CEO.'
            }
          />
        )}
        <ul className="mt-3 space-y-2">
          {list.data?.items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(r.id);
                  setComposing(false);
                }}
                aria-current={selected === r.id ? 'true' : undefined}
                className={cn(
                  'w-full rounded-card border p-3 text-left text-sm',
                  selected === r.id
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:bg-surface-sunken',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-fg">{r.subject}</span>
                  {r.unread > 0 && (
                    <span
                      aria-label={`${r.unread} unread`}
                      className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-fg"
                    >
                      {r.unread}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-fg-muted">
                  {r.anonymous ? 'Anonymous' : (r.reporterName ?? 'You')} ·{' '}
                  {formatDateTime(r.lastMessageAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn('min-w-0', !selected && !composing ? 'hidden lg:block' : '')}>
        {composing ? (
          <NewReport
            onCancel={() => setComposing(false)}
            onDone={(id) => {
              setComposing(false);
              setSelected(id);
            }}
          />
        ) : selected ? (
          <ReportThread id={selected} asCeo={asCeo} onBack={() => setSelected(null)} />
        ) : (
          <div className="flex min-h-[30rem] items-center justify-center rounded-card border border-dashed border-border bg-surface-raised p-6">
            <EmptyState title="Pick a report" description="Choose one on the left." />
          </div>
        )}
      </div>
    </div>
  );
}

/** Messages for an org member, or for the platform console when `mode` is "platform". */
export function MessagesApp({ mode }: { mode: Mode }) {
  const { session } = useHrmsAuth();
  const [tab, setTab] = useState<Tab>('conversations');
  const role = session?.role ?? null;
  const showReports = mode === 'org' && role !== null && role !== 'gameMaster';
  const tabs = useMemo(
    () => [
      { id: 'conversations' as const, label: 'Conversations' },
      ...(showReports
        ? [{ id: 'reports' as const, label: role === 'ceo' ? 'Reports' : 'My reports' }]
        : []),
    ],
    [showReports, role],
  );

  return (
    <PageShell>
      <PageHeader
        title="Messages"
        description={
          mode === 'platform'
            ? 'Coordinate platform work and review system reports.'
            : 'Keep conversations, reports, and follow-up work in one place.'
        }
      />
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Messages" className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px min-h-10 border-b-2 px-4 text-sm font-medium',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'conversations' || !showReports ? (
        <Conversations mode={mode} />
      ) : (
        <Reports asCeo={role === 'ceo'} />
      )}
    </PageShell>
  );
}
