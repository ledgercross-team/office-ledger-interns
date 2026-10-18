'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { PersonManager } from '@/components/hrms/platform-people';
import type { PlatformGameMaster, PlatformOrg, PlatformRequest } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';
const card = 'space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4';

function message(error: unknown): string {
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
    <p role="alert" className="text-sm text-alert-deep">
      {text}
    </p>
  ) : null;
}

function CeoPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
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
          {list.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
          {list.error && (
            <p role="alert" className="text-sm text-alert-deep">
              {message(list.error)}
            </p>
          )}
          <ul className="space-y-2">
            {list.data?.items.map((c) => (
              <li key={c.memberId} className="space-y-2 rounded-xl border border-charcoal/10 p-3">
                <p className="text-sm text-charcoal">
                  {c.fullName}{' '}
                  <span className="text-xs text-charcoal-soft">
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
            <p className="text-xs text-charcoal-soft">
              This is the organisation&apos;s only active CEO, so it cannot be removed here. Use a
              last-CEO removal request.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OrgRow({ org, plans, onDone }: { org: PlatformOrg; plans: string[]; onDone: () => void }) {
  const [plan, setPlan] = useState(org.planCode);
  const [reason, setReason] = useState('');
  const { mutation, error } = useAction(onDone);
  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
      <p className="text-sm text-charcoal">
        <span className="font-medium">{org.name}</span> · {org.status} · {org.planCode} · seats{' '}
        {org.seatsUsed}/{org.seatLimit}
      </p>
      <p className="text-xs text-charcoal-soft">
        {org.ceoCount} CEO, {org.cooCount} COO
        {org.overThreshold && (
          <span className="ml-2 text-alert-deep">More than 25 CEOs and COOs</span>
        )}
      </p>
      <CeoPanel orgId={org.id} orgName={org.name} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`org-plan-${org.id}`} className="sr-only">
          Plan for {org.name}
        </label>
        <select
          id={`org-plan-${org.id}`}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className={`${input} sm:w-44`}
        >
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={plan === org.planCode || mutation.isPending}
          onClick={() =>
            mutation.mutate({ path: `/platform/orgs/${org.id}/plan`, body: { planCode: plan } })
          }
          className={secondary}
        >
          Change plan
        </button>
        {org.status === 'blocked' ? (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ path: `/platform/orgs/${org.id}/unblock` })}
            className={secondary}
          >
            Unblock
          </button>
        ) : (
          <>
            <label htmlFor={`block-reason-${org.id}`} className="sr-only">
              Reason to block {org.name}
            </label>
            <input
              id={`block-reason-${org.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason to block"
              className={`${input} sm:w-48`}
            />
            <button
              type="button"
              disabled={reason.trim().length === 0 || mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  path: `/platform/orgs/${org.id}/block`,
                  body: { reason: reason.trim() },
                })
              }
              className={secondary}
            >
              Block
            </button>
          </>
        )}
      </div>
      <Error text={error} />
    </li>
  );
}

export function Orgs() {
  const queryClient = useQueryClient();
  const orgs = useQuery({
    queryKey: ['hrms', 'platform', 'orgs'],
    queryFn: () => hrmsFetch<{ items: PlatformOrg[] }>('/platform/orgs'),
  });
  const plans = useQuery({
    queryKey: ['hrms', 'platform', 'plans'],
    queryFn: () => hrmsFetch<{ items: Array<{ code: string }> }>('/platform/plans'),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['hrms', 'platform'] });
  const { mutation, error } = useAction(refresh);
  const planCodes = plans.data?.items.map((p) => p.code) ?? [];

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    mutation.mutate(
      {
        path: '/platform/orgs',
        body: {
          name: String(f.get('name')).trim(),
          planCode: String(f.get('plan')),
          ceoEmail: String(f.get('email')).trim(),
          ceoFullName: String(f.get('ceoName')).trim(),
        },
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-charcoal">Organisations</h2>
      <p className="text-xs text-charcoal-soft">Counts only. No organisation data is shown here.</p>
      <ul className="space-y-2">
        {orgs.data?.items.map((o) => (
          <OrgRow key={o.id} org={o} plans={planCodes} onDone={refresh} />
        ))}
      </ul>
      <form onSubmit={onCreate} className={`${card} max-w-lg`}>
        <h3 className="text-sm font-medium text-charcoal">New organisation</h3>
        <label htmlFor="new-org-name" className="block space-y-1 text-sm text-charcoal">
          Organisation name
          <input
            id="new-org-name"
            name="name"
            required
            placeholder="Organisation name"
            className={input}
          />
        </label>
        <label htmlFor="new-org-plan" className="block space-y-1 text-sm text-charcoal">
          Plan
          <select id="new-org-plan" name="plan" required className={input}>
            {planCodes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="new-org-ceo-name" className="block space-y-1 text-sm text-charcoal">
          CEO full name
          <input
            id="new-org-ceo-name"
            name="ceoName"
            required
            placeholder="CEO full name"
            className={input}
          />
        </label>
        <label htmlFor="new-org-email" className="block space-y-1 text-sm text-charcoal">
          CEO email
          <input
            id="new-org-email"
            name="email"
            type="email"
            required
            placeholder="CEO email"
            className={input}
          />
        </label>
        <Error text={error} />
        <button type="submit" disabled={mutation.isPending} className={primary}>
          Create
        </button>
      </form>
    </section>
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
      <h2 className="font-medium text-charcoal">Recovery and CEO removal</h2>
      <p className="text-xs text-charcoal-soft">
        Check the person offline before verifying. A verified recovery sends a one-time link to the
        new address.
      </p>
      {list.data && list.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No requests.</p>
      )}
      <ul className="space-y-2">
        {list.data?.items.map((r) => (
          <li key={r.id} className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-3">
            <p className="text-sm text-charcoal">
              {r.orgName}:{' '}
              {r.type === 'ceo_recovery'
                ? `recover CEO access to ${r.newEmail}`
                : 'replace the last CEO'}{' '}
              <span className="text-xs text-charcoal-soft">({r.status})</span>
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
      <h2 className="font-medium text-charcoal">GameMasters</h2>
      <ul className="space-y-2">
        {list.data?.items.map((g) => (
          <li
            key={g.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-charcoal/10 bg-white p-3"
          >
            <span className="text-sm text-charcoal">
              {g.fullName}{' '}
              <span className="text-xs text-charcoal-soft">
                {g.email} · {g.status.replace('_', ' ')}
              </span>
            </span>
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
            {g.status !== 'removed' && (
              <div className="w-full">
                <PersonManager
                  base={`/platform/game-masters/${g.userId}`}
                  fullName={g.fullName}
                  email={g.email}
                  canRemove={g.userId !== session?.user.id}
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
        <div role="status" className={`${card} max-w-lg border-forest/30`}>
          <h3 className="text-sm font-medium text-charcoal">
            Temporary password for {issued.email}
          </h3>
          <p className="font-mono text-base tabular-nums text-charcoal select-all">
            {issued.password}
          </p>
          <p className="text-xs text-charcoal-soft">
            Give this to them yourself. It is shown only now. They must choose their own password
            the first time they sign in, after another gameMaster confirms them.
          </p>
          <button type="button" onClick={() => setIssued(null)} className={primary}>
            I have shared it
          </button>
        </div>
      )}
      <form onSubmit={onCreate} className={`${card} max-w-lg`}>
        <h3 className="text-sm font-medium text-charcoal">Add a gameMaster</h3>
        <p className="text-xs text-charcoal-soft">
          An active gameMaster other than them must confirm them before they can sign in.
        </p>
        <label htmlFor="new-gamemaster-name" className="block space-y-1 text-sm text-charcoal">
          Full name
          <input
            id="new-gamemaster-name"
            name="name"
            required
            placeholder="Full name"
            className={input}
          />
        </label>
        <label htmlFor="new-gamemaster-email" className="block space-y-1 text-sm text-charcoal">
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
        <Error text={error} />
        <button type="submit" disabled={mutation.isPending} className={primary}>
          Add
        </button>
      </form>
    </section>
  );
}
