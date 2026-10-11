'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { ApiError, apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate } from '@/lib/format';
import type { Company, GameMasterCompanyDetail, Subscription } from '@/lib/types';

type Confirming = 'deactivate' | 'reset' | { cancel: string } | null;

function Input({
  id,
  label,
  type = 'text',
  defaultValue,
  required = true,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
      />
    </div>
  );
}

function subscriptionState(item: Subscription, today: string): string {
  if (item.cancelledAt) return 'Cancelled';
  if (item.endsOn < today) return 'Ended';
  if (item.startsOn > today) return 'Upcoming';
  return 'Current';
}

function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  // Next keeps a page's state when you navigate away, so drop the password explicitly on leave.
  useEffect(() => () => setTemporaryPassword(null), []);

  const query = useQuery({
    queryKey: ['companies', 'detail', companyId],
    queryFn: () => apiFetch<GameMasterCompanyDetail>(`/game-master/companies/${companyId}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['companies'] });
  const fail = (err: unknown) => setError(errorMessage(err));

  const updateCompany = useMutation({
    mutationFn: (body: Partial<Pick<Company, 'name' | 'timezone' | 'workStartTime' | 'isActive'>>) =>
      apiFetch<Company>(`/game-master/companies/${companyId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setConfirming(null);
      await refresh();
    },
    onError: fail,
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      apiFetch<{ temporaryPassword: string }>(
        `/game-master/companies/${companyId}/reset-admin-password`,
        { method: 'POST' },
      ),
    onSuccess: (result) => {
      setConfirming(null);
      setTemporaryPassword(result.temporaryPassword);
    },
    onError: fail,
  });

  const addSubscription = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch<Subscription>(`/game-master/companies/${companyId}/subscriptions`, {
        method: 'POST',
        body,
      }),
    onSuccess: async () => {
      setSaved('Subscription added.');
      await refresh();
    },
    onError: fail,
  });

  const updateSubscription = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<Subscription>(`/game-master/subscriptions/${id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setConfirming(null);
      setSaved('Subscription updated.');
      await refresh();
    },
    onError: fail,
  });

  if (query.error instanceof ApiError && [400, 404].includes(query.error.status)) {
    notFound();
  }
  if (query.isLoading) {
    return <p className="text-sm text-charcoal-soft">Loading…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {errorMessage(query.error)}
      </p>
    );
  }

  const { company, admin, subscriptions } = query.data;
  const today = new Date().toLocaleDateString('en-CA');

  function onSaveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(null);
    updateCompany.mutate(
      {
        name: String(form.get('name')).trim(),
        timezone: String(form.get('timezone')).trim(),
        workStartTime: String(form.get('workStartTime')).slice(0, 5),
      },
      { onSuccess: () => setSaved('Company saved.') },
    );
  }

  function onAddSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const notes = String(form.get('notes')).trim();
    setError(null);
    setSaved(null);
    addSubscription.mutate({
      planName: String(form.get('planName')).trim(),
      startsOn: String(form.get('startsOn')),
      endsOn: String(form.get('endsOn')),
      ...(notes ? { notes } : {}),
    });
  }

  function onExtend(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(null);
    updateSubscription.mutate({ id, body: { endsOn: String(form.get('endsOn')) } });
  }

  const confirmBox = (title: string, yes: string, onYes: () => void) => (
    <div role="alertdialog" aria-label={title} className="space-y-2 text-sm">
      <p>{title}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onYes} className="rounded-xl bg-alert px-3 py-1 text-white">
          {yes}
        </button>
        <button type="button" onClick={() => setConfirming(null)} className="rounded-xl border border-charcoal/15 px-3 py-1">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm">
          <Link href="/game-master" className="underline">
            Companies
          </Link>
        </p>
        <h1 className="text-xl font-semibold">{company.name}</h1>
        <p className="text-sm text-charcoal-soft">
          {company.isActive ? 'Active' : 'Inactive'} · {company.timezone} · starts {company.workStartTime.slice(0, 5)}
          {' · '}
          <Link href={`/game-master/messages/${company.id}`} className="underline">
            Messages
          </Link>
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-evergreen">{saved}</p>}
      {temporaryPassword && <TemporaryPasswordPanel password={temporaryPassword} />}

      <form onSubmit={onSaveCompany} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Company</h2>
        <Input id="name" label="Name" defaultValue={company.name} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="timezone" label="Timezone" defaultValue={company.timezone} />
          <Input
            id="workStartTime"
            label="Work start time"
            type="time"
            defaultValue={company.workStartTime.slice(0, 5)}
          />
        </div>
        <button
          type="submit"
          disabled={updateCompany.isPending}
          className="rounded-xl bg-evergreen px-3 py-1 text-sm text-white disabled:opacity-60"
        >
          Save changes
        </button>
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm">
          Admin: {admin ? `${admin.fullName} (${admin.email})` : 'none'}
        </p>

        {confirming === 'deactivate' &&
          confirmBox(
            `Deactivate ${company.name}? Everyone in the company will be signed out and unable to log in.`,
            'Yes, deactivate',
            () => updateCompany.mutate({ isActive: false }),
          )}
        {confirming === 'reset' &&
          confirmBox(
            `Reset the admin password for ${company.name}? Their sessions will be signed out.`,
            'Yes, reset password',
            () => resetPassword.mutate(),
          )}
        {(confirming === null || typeof confirming === 'object') && (
          <div className="flex flex-wrap gap-2 text-sm">
            {company.isActive ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming('deactivate');
                }}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
              >
                Deactivate company
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateCompany.mutate({ isActive: true })}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
              >
                Reactivate company
              </button>
            )}
            {admin && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setTemporaryPassword(null);
                  setConfirming('reset');
                }}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
              >
                Reset admin password
              </button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Subscriptions</h2>
        {subscriptions.length === 0 && <p className="text-sm text-charcoal-soft">None yet.</p>}
        <ul className="space-y-3">
          {subscriptions.map((item) => {
            const state = subscriptionState(item, today);
            const cancelling = typeof confirming === 'object' && confirming?.cancel === item.id;
            return (
              <li key={item.id} className="space-y-2 rounded-xl border border-charcoal/15 p-3 text-sm">
                <p>
                  <span className="font-medium">{item.planName}</span> · {formatDate(item.startsOn)} to{' '}
                  {formatDate(item.endsOn)} · {state}
                </p>
                {item.notes && <p className="text-charcoal-soft">{item.notes}</p>}
                {!item.cancelledAt && (
                  <form
                    onSubmit={(event) => onExtend(event, item.id)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <div className="space-y-1">
                      <label htmlFor={`ends-${item.id}`} className="block text-xs font-medium">
                        New end date
                      </label>
                      <input
                        id={`ends-${item.id}`}
                        name="endsOn"
                        type="date"
                        defaultValue={item.endsOn}
                        required
                        className="rounded-xl border border-charcoal/15 bg-white px-2 py-1"
                      />
                    </div>
                    <button type="submit" className="rounded-xl border border-charcoal/15 px-3 py-1">
                      Update end date
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming({ cancel: item.id })}
                      className="rounded-xl border border-charcoal/15 px-3 py-1"
                    >
                      Cancel subscription
                    </button>
                  </form>
                )}
                {cancelling &&
                  confirmBox(
                    'Cancel this subscription? The company loses access immediately if it is the current one.',
                    'Yes, cancel subscription',
                    () => updateSubscription.mutate({ id: item.id, body: { cancel: true } }),
                  )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={onAddSubscription} className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Add subscription</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input id="planName" label="Plan name" defaultValue="Standard" />
            <Input id="startsOn" label="Starts on" type="date" />
            <Input id="endsOn" label="Ends on" type="date" />
          </div>
          <Input id="notes" label="Notes (optional)" required={false} />
          <button
            type="submit"
            disabled={addSubscription.isPending}
            className="rounded-xl bg-evergreen px-3 py-1 text-sm text-white disabled:opacity-60"
          >
            Add subscription
          </button>
        </form>
      </section>
    </div>
  );
}

export default function CompanyDetailPage() {
  return (
    <RoleGate allow={['game_master']}>
      <CompanyDetail />
    </RoleGate>
  );
}
