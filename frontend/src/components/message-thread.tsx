'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDateTime } from '@/lib/format';
import type { Message } from '@/lib/types';

const POLL_MS = 30_000;

// One conversation between the game master and a company's admin.
export function MessageThread({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const thread = useQuery({
    queryKey: ['messages', companyId],
    queryFn: () => apiFetch<{ items: Message[] }>(`/message-threads/${companyId}/messages`),
    refetchInterval: POLL_MS,
    // Keep polling in a background tab so a reply is there as soon as you come back.
    refetchIntervalInBackground: true,
  });

  const send = useMutation({
    mutationFn: (text: string) =>
      apiFetch<Message>(`/message-threads/${companyId}/messages`, {
        method: 'POST',
        body: { body: text },
      }),
    onSuccess: async () => {
      setBody('');
      setError(null);
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
  const hasUnread = thread.data?.items.some(
    (message) => message.readAt === null && message.senderId !== user?.id,
  );
  useEffect(() => {
    if (hasUnread && !markRead.isPending) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (text) {
      send.mutate(text);
    }
  }

  return (
    <section aria-label="Messages" className="space-y-4">
      <div className="space-y-2" aria-live="polite">
        {thread.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {thread.error && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(thread.error)}
          </p>
        )}
        {thread.data && thread.data.items.length === 0 && (
          <p className="text-sm text-neutral-500">No messages yet.</p>
        )}
        {thread.data?.items.map((message) => {
          const mine = message.senderId === user?.id;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${mine ? 'bg-blue-50 text-blue-950' : ''}`}
              >
                <p className="text-xs text-neutral-500">
                  {message.senderName ?? 'Someone'} · {formatDateTime(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="message-body" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="message-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={3}
          className="w-full rounded border px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={send.isPending || body.trim() === ''}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
