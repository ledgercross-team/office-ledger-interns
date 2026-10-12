'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDate, formatDateTime, formatTime } from '@/lib/format';
import type { Message } from '@/lib/types';

const POLL_MS = 30_000;

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function dayLabel(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-CA');
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return formatDate(day);
}

interface MessageThreadProps {
  companyId: string;
  title: string;
  subtitle?: string;
  className?: string;
}

// One conversation between the game master and a company's admin,
// presented like a messenger thread.
export function MessageThread({ companyId, title, subtitle, className }: MessageThreadProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const thread = useQuery({
    queryKey: ['messages', companyId],
    queryFn: () => apiFetch<{ items: Message[] }>(`/message-threads/${companyId}/messages`),
    refetchInterval: POLL_MS,
    // Keep polling in a background tab so a reply is there as soon as you come back.
    refetchIntervalInBackground: true,
  });

  const items = useMemo(() => thread.data?.items ?? [], [thread.data]);

  // Stick to the bottom on first load, and on new messages only when the
  // user is already near the bottom (so reading history is never yanked).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items.length]);

  const send = useMutation({
    mutationFn: (text: string) =>
      apiFetch<Message>(`/message-threads/${companyId}/messages`, {
        method: 'POST',
        body: { body: text },
      }),
    onSuccess: async () => {
      setBody('');
      setError(null);
      stick.current = true;
      await queryClient.invalidateQueries({ queryKey: ['messages', companyId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const markRead = useMutation({
    mutationFn: () => apiFetch(`/message-threads/${companyId}/mark-read`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
      ]);
    },
  });

  // The thread is open, so anything the other side sent counts as read.
  const hasUnread = items.some(
    (message) => message.readAt === null && message.senderId !== user?.id,
  );
  useEffect(() => {
    if (hasUnread && !markRead.isPending) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (text) {
      send.mutate(text);
    }
  }

  const lastOwnIndex = items.map((message) => message.senderId === user?.id).lastIndexOf(true);

  // Day dividers, precomputed so render stays pure.
  const dayBreaks = useMemo(() => {
    const breaks = new Set<string>();
    let last = '';
    for (const message of items) {
      const day = dayLabel(message.createdAt);
      if (day !== last) {
        breaks.add(message.id);
        last = day;
      }
    }
    return breaks;
  }, [items]);

  return (
    <section
      aria-label={`Messages with ${title}`}
      className={`flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:min-h-[420px] ${className ?? 'h-[calc(100dvh-14rem)] sm:h-[calc(100dvh-17rem)]'}`}
    >
      <header className="flex items-center gap-3 border-b border-charcoal/10 bg-forest px-4 py-3 text-white">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint font-semibold text-forest-deep">
          {initials(title)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          {subtitle && <p className="truncate text-sm text-mist/80">{subtitle}</p>}
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="slim-scroll flex-1 space-y-3 overflow-y-auto bg-offwhite px-4 py-4"
        aria-live="polite"
      >
        {thread.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {thread.error && (
          <p role="alert" className="text-sm text-alert-deep">
            {errorMessage(thread.error)}
          </p>
        )}
        {!thread.isLoading && !thread.error && items.length === 0 && (
          <p className="py-8 text-center text-sm text-charcoal-soft">
            No messages yet. Say hello to start the conversation.
          </p>
        )}
        {items.map((message, index) => {
          const mine = message.senderId === user?.id;
          const showDay = dayBreaks.has(message.id);

          return (
            <div key={message.id}>
              {showDay && (
                <p className="py-1 text-center text-xs font-medium text-charcoal-soft">{dayLabel(message.createdAt)}</p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && (
                    <p className="mb-0.5 px-1 text-xs text-charcoal-soft">
                      {message.senderName ?? 'Someone'}
                    </p>
                  )}
                  <div
                    title={formatDateTime(message.createdAt)}
                    className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                      mine ? 'rounded-br-md bg-evergreen text-white' : 'rounded-bl-md border border-charcoal/10 bg-white text-charcoal'
                    }`}
                  >
                    {message.body}
                  </div>
                  <p className="mt-0.5 px-1 text-[11px] text-charcoal-soft">
                    {formatTime(message.createdAt)}
                    {mine && index === lastOwnIndex && (
                      <> · {message.readAt ? 'Seen' : 'Sent'}</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="border-t border-charcoal/10 bg-white p-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`message-body-${companyId}`} className="sr-only">
            Message {title}
          </label>
          <input
            id={`message-body-${companyId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            placeholder={`Message ${title}…`}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border border-charcoal/15 bg-offwhite px-4 py-2.5 text-sm outline-none placeholder:text-charcoal-soft focus:border-evergreen"
          />
          <button
            type="submit"
            disabled={send.isPending || body.trim() === ''}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-evergreen text-white transition-colors hover:bg-evergreen-dark disabled:opacity-50"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-alert-deep">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
