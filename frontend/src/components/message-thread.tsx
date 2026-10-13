'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
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

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      const text = body.trim();
      if (text && !send.isPending) {
        send.mutate(text);
      }
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
      className={`flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_8px_30px_rgba(28,43,37,0.07)] sm:min-h-[560px] ${className ?? 'h-[calc(100dvh-19rem)] sm:h-[calc(100dvh-21rem)]'}`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-charcoal/10 bg-white px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mist font-semibold text-forest">
            {initials(title)}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-evergreen" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-charcoal">{title}</p>
            {subtitle && <p className="truncate text-sm text-charcoal-soft">{subtitle}</p>}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-xs text-charcoal-soft sm:flex">
          <span className="h-2 w-2 rounded-full bg-evergreen" aria-hidden />
          Active conversation
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="slim-scroll flex-1 space-y-4 overflow-y-auto bg-[#f5f8f6] px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {thread.isLoading && (
          <div className="space-y-3" aria-label="Loading messages">
            <div className="h-3 w-24 animate-pulse rounded bg-charcoal/10" />
            <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-white" />
            <div className="ml-auto h-12 w-1/2 animate-pulse rounded-2xl bg-mist" />
          </div>
        )}
        {thread.error && (
          <p role="alert" className="text-sm text-alert-deep">
            {errorMessage(thread.error)}
          </p>
        )}
        {!thread.isLoading && !thread.error && items.length === 0 && (
          <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
            <span aria-hidden className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-mist text-evergreen">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.9-4.2A8.1 8.1 0 0 1 3 11.5 8.38 8.38 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z" />
                <path d="M8 12h.01M12 12h.01M16 12h.01" />
              </svg>
            </span>
            <p className="font-medium text-charcoal">Your conversation starts here</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-charcoal-soft">
              Send a message below and the game master will get back to you.
            </p>
          </div>
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
                    className={`break-words rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
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

      <form onSubmit={onSubmit} className="border-t border-charcoal/10 bg-white p-3 sm:p-4">
        <div className="rounded-xl border border-charcoal/15 bg-offwhite p-2 transition-colors focus-within:border-evergreen/60 focus-within:ring-2 focus-within:ring-evergreen/10">
          <label htmlFor={`message-body-${companyId}`} className="sr-only">
            Message {title}
          </label>
          <textarea
            id={`message-body-${companyId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onComposerKeyDown}
            maxLength={2000}
            placeholder={`Message ${title}…`}
            autoComplete="off"
            rows={2}
            className="block min-h-14 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-charcoal-soft"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-charcoal/10 px-2 pt-2">
            <p className="text-[11px] text-charcoal-soft">{body.length}/2000 · Ctrl/Cmd + Enter to send</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBody('');
                  setError(null);
                }}
                disabled={body.trim() === '' || send.isPending}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={send.isPending || body.trim() === ''}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-evergreen px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {send.isPending ? 'Sending…' : 'Send message'}
                {!send.isPending && (
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                )}
              </button>
            </div>
          </div>
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
