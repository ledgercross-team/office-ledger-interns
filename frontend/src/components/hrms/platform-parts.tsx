'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  ErrorState,
  Skeleton,
  cardClass,
  controlClass,
  labelClass,
  primaryActionClass,
  secondaryActionClass,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { PersonManager } from '@/components/hrms/platform-people';
import type { PlatformGameMaster, PlatformRequest } from '@/lib/hrms/types';

const input = controlClass;
const primary = primaryActionClass;
const secondary = secondaryActionClass;
const card = `space-y-3 ${cardClass}`;

export function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function useAction(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      hrmsFetch(path, { method: 'POST', body: body ?? {} }),
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (e) => setError(message(e)),
  });
  return { mutation, error };
}

function Error({ text }: { text: string | null }) {
  return text ? (
    <Banner tone="danger" title="Action failed">
      {text}
    </Banner>
  ) : null;
}

export function CeoPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'ceos', orgId],
    queryFn: () =>
      hrmsFetch<{
        items: Array<{ memberId: string; fullName: string; email: string; status: string }>;
      }>(`/platform/orgs/${orgId}/ceos`),
    enabled: open,
  });
  const activeCount = list.data?.items.filter((c) => c.status === 'active').length ?? 0;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={secondary}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide CEOs' : 'Manage CEOs'}
      </button>
      {open && (
        <div className="space-y-2" role="region" aria-label={`CEOs of ${orgName}`}>
          {list.isLoading && <Skeleton className="h-10 w-full" />}
          {list.error && (
            <ErrorState
              title="Could not load CEOs"
              message={message(list.error)}
              onRetry={() => void list.refetch()}
            />
          )}
          <ul className="space-y-2">
            {list.data?.items.map((c) => (
              <li key={c.memberId} className="space-y-2 rounded-control border border-border p-3">
                <p className="text-sm text-fg">
                  {c.fullName}{' '}
                  <span className="text-xs text-fg-muted">
                    {c.email} · {c.status}
                  </span>
                </p>
                {c.status !== 'deactivated' && (
                  <PersonManager
                    base={`/platform/ceos/${c.memberId}`}
                    fullName={c.fullName}
                    email={c.email}
                    canRemove={activeCount > 1}
                    onChanged={() =>
                      void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {activeCount === 1 && (
            <p className="text-xs text-fg-muted">
              This is the organisation&apos;s only active CEO, so it cannot be removed here. Use a
              last-CEO removal request.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Requests() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'requests'],
    queryFn: () => hrmsFetch<{ items: PlatformRequest[] }>('/platform/requests'),
  });
  const { mutation, error } = useAction(
    () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] }),
  );
  return (
    <section className="space-y-3">
      <h2 className="font-medium text-fg">Recovery and CEO removal</h2>
      <p className="text-xs text-fg-muted">
        Check the person offline before verifying. A verified recovery sends a one-time link to the
        new address.
      </p>
      {list.data && list.data.items.length === 0 && (
        <p className="text-sm text-fg-muted">No requests.</p>
      )}
      <ul className="space-y-2">
        {list.data?.items.map((r) => (
          <li key={r.id} className="space-y-2 rounded-card border border-border bg-surface p-3">
            <p className="text-sm text-fg">
              {r.orgName}:{' '}
              {r.type === 'ceo_recovery'
                ? `recover CEO access to ${r.newEmail}`
                : 'replace the last CEO'}{' '}
              <span className="text-xs text-fg-muted">({r.status})</span>
            </p>
            <div className="flex gap-2">
              {r.status === 'pending' && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ path: `/platform/requests/${r.id}/verify` })}
                  className={primary}
                >
                  Verified offline
                </button>
              )}
              {r.status === 'verified' && r.type === 'remove_last_ceo' && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ path: `/platform/requests/${r.id}/complete` })}
                  className={primary}
                >
                  Complete removal
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Error text={error} />
    </section>
  );
}

export function GameMasters() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['hrms', 'platform', 'gms'],
    queryFn: () => hrmsFetch<{ items: PlatformGameMaster[] }>('/platform/game-masters'),
  });
  const { mutation, error } = useAction(
    () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] }),
  );

  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const email = String(f.get('email')).trim();
    mutation.mutate(
      { path: '/platform/game-masters', body: { email, fullName: String(f.get('name')).trim() } },
      {
        onSuccess: (data) => {
          form.reset();
          const password = (data as { temporaryPassword?: string } | undefined)?.temporaryPassword;
          setIssued(password ? { email, password } : null);
        },
      },
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-fg">GameMasters</h2>
      <ul className="space-y-2">
        {list.data?.items.map((g) => (
          <li key={g.userId} className="space-y-3 rounded-card border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{g.fullName}</p>
                <p className="mt-1 truncate text-xs text-fg-muted">
                  {g.email} · {g.status.replace('_', ' ')}
                </p>
              </div>
              {g.status === 'pending_confirmation' && (
                <span className="w-fit rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning-fg">
                  Awaiting confirmation
                </span>
              )}
            </div>
            {g.status !== 'removed' && (
              <div className="flex flex-wrap items-start gap-2 border-t border-border pt-3">
                {g.status === 'pending_confirmation' && g.userId !== session?.user.id && (
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ path: `/platform/game-masters/${g.userId}/confirm` })
                    }
                    className={primary}
                  >
                    Confirm
                  </button>
                )}
                <PersonManager
                  base={`/platform/game-masters/${g.userId}`}
                  fullName={g.fullName}
                  email={g.email}
                  canRemove={g.userId !== session?.user.id}
                  removeLabel={g.status === 'pending_confirmation' ? 'Remove pending' : 'Remove'}
                  onChanged={() =>
                    void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] })
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {issued && (
        <div role="status" className={`${card} max-w-lg border-success/30 bg-success-soft`}>
          <h3 className="text-sm font-medium text-fg">Temporary password for {issued.email}</h3>
          <p className="select-all font-mono text-base tabular-nums text-fg">{issued.password}</p>
          <p className="text-xs text-fg-muted">
            Give this to them yourself. It is shown only now. They must choose their own password
            the first time they sign in, after another gameMaster confirms them.
          </p>
          <button type="button" onClick={() => setIssued(null)} className={primary}>
            I have shared it
          </button>
        </div>
      )}
      <form onSubmit={onCreate} className={`${card} max-w-none`}>
        <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h3 className="text-base font-semibold text-fg">Add a game master</h3>
            <p className="mt-1 text-sm text-fg-muted">
              An active game master other than them must confirm access before they can sign in.
            </p>
          </div>
          <span className="w-fit rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
            Access control
          </span>
        </div>
        <div className="grid gap-4 pt-1 md:grid-cols-2">
          <label htmlFor="new-gamemaster-name" className={labelClass}>
            Full name
            <input
              id="new-gamemaster-name"
              name="name"
              required
              placeholder="Full name"
              className={input}
            />
          </label>
          <label htmlFor="new-gamemaster-email" className={labelClass}>
            Email
            <input
              id="new-gamemaster-email"
              name="email"
              type="email"
              required
              placeholder="Email"
              className={input}
            />
          </label>
        </div>
        <Error text={error} />
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-muted">
            A temporary password is shown once after creation.
          </p>
          <button type="submit" disabled={mutation.isPending} className={primary}>
            Add game master
          </button>
        </div>
      </form>
    </section>
  );
}
