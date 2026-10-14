'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { DateInput } from '@/components/date-input';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { TimezoneSelect, timezoneLabel } from '@/components/timezone-select';
import { ApiError, apiFetch } from '@/lib/api-client';
import { errorMessage, formatDate, todayIn } from '@/lib/format';
import type { Company, CompanyAdmin, GameMasterCompanyDetail, Subscription } from '@/lib/types';

type Confirming = 'deactivate' | 'discard' | { reset: string } | { cancel: string } | null;

function Input({
  id,
  name,
  label,
  type = 'text',
  defaultValue,
  required = true,
}: {
  id: string;
  // The form field name; defaults to the id. Repeated forms need unique ids but shared names.
  name?: string;
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
      {type === 'date' ? (
        <DateInput
          id={id}
          name={name ?? id}
          defaultValue={defaultValue}
          required={required}
          className="w-full rounded-xl border border-charcoal/15 bg-white"
        />
      ) : (
        <input
          id={id}
          name={name ?? id}
          type={type}
          defaultValue={defaultValue}
          required={required}
          className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        />
      )}
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
  const router = useRouter();
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

  const discardCompany = useMutation({
    mutationFn: () =>
      apiFetch<void>(`/game-master/companies/${companyId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      router.replace('/game-master');
    },
    onError: fail,
  });

  const resetPassword = useMutation({
    mutationFn: (adminId: string) =>
      apiFetch<{ temporaryPassword: string }>(
        `/game-master/companies/${companyId}/admins/${adminId}/reset-password`,
        { method: 'POST' },
      ),
    onSuccess: (result) => {
      setConfirming(null);
      setTemporaryPassword(result.temporaryPassword);
    },
    onError: fail,
  });

  const addAdmin = useMutation({
    mutationFn: (body: { fullName: string; email: string }) =>
      apiFetch<{ admin: CompanyAdmin; temporaryPassword: string }>(
        `/game-master/companies/${companyId}/admins`,
        { method: 'POST', body },
      ),
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporaryPassword);
      setSaved(`${result.admin.fullName} was added as an admin.`);
      await refresh();
    },
    onError: fail,
  });

  const setAdminActive = useMutation({
    mutationFn: ({ adminId, isActive }: { adminId: string; isActive: boolean }) =>
      apiFetch<CompanyAdmin>(`/game-master/companies/${companyId}/admins/${adminId}`, {
        method: 'PATCH',
        body: { isActive },
      }),
    onSuccess: async () => {
      setSaved('Admin updated.');
      await refresh();
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

  const { company, admins, subscriptions } = query.data;
  const today = todayIn(company.timezone);

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

  function onEditSubscription(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(null);
    updateSubscription.mutate({
      id,
      body: {
        planName: String(form.get('planName')).trim(),
        startsOn: String(form.get('startsOn')),
        endsOn: String(form.get('endsOn')),
        notes: String(form.get('notes')).trim(),
      },
    });
  }

  function onAddAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setSaved(null);
    setTemporaryPassword(null);
    addAdmin.mutate(
      { fullName: String(data.get('adminFullName')).trim(), email: String(data.get('adminEmail')).trim() },
      { onSuccess: () => form.reset() },
    );
  }

  const confirmBox = (title: string, yes: string, onYes: () => void) => (
    <div role="alertdialog" aria-label={title} className="space-y-2 text-sm">
      <p>{title}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onYes}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alert px-3 py-2 text-white sm:w-auto"
        >
          {yes}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6">
      <div>
        <p className="text-sm">
          <Link href="/game-master" className="inline-flex min-h-11 items-center underline">
            Companies
          </Link>
        </p>
        <h1 className="break-words text-xl font-semibold">{company.name}</h1>
        <p className="break-words text-sm text-charcoal-soft">
          {company.isActive ? 'Active' : 'Inactive'} · {timezoneLabel(company.timezone)} · starts{' '}
          {company.workStartTime.slice(0, 5)}
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
          <TimezoneSelect id="timezone" label="Timezone" defaultValue={company.timezone} />
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
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
        >
          Save changes
        </button>
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Admins</h2>
        {admins.length === 0 && <p className="text-sm text-charcoal-soft">No admins yet.</p>}
        <ul className="divide-y divide-charcoal/10">
          {admins.map((item) => {
            const resetting =
              typeof confirming === 'object' && confirming !== null && 'reset' in confirming && confirming.reset === item.id;
            return (
              <li key={item.id} className="space-y-2 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words">
                    <span className="font-medium">{item.fullName}</span>{' '}
                    <span className="text-charcoal-soft">({item.email})</span>
                    {!item.isActive && <span className="text-alert-deep"> · Inactive</span>}
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setTemporaryPassword(null);
                        setConfirming({ reset: item.id });
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      disabled={setAdminActive.isPending}
                      onClick={() => {
                        setError(null);
                        setSaved(null);
                        setAdminActive.mutate({ adminId: item.id, isActive: !item.isActive });
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
                    >
                      {item.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
                {resetting &&
                  confirmBox(
                    `Reset the password for ${item.fullName}? Their sessions will be signed out.`,
                    'Yes, reset password',
                    () => resetPassword.mutate(item.id),
                  )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={onAddAdmin} className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Add another admin</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="adminFullName" label="Full name" />
            <Input id="adminEmail" label="Email" type="email" />
          </div>
          <button
            type="submit"
            disabled={addAdmin.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
          >
            {addAdmin.isPending ? 'Adding…' : 'Add admin'}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Subscriptions</h2>
        {subscriptions.length === 0 && <p className="text-sm text-charcoal-soft">None yet.</p>}
        <ul className="space-y-3">
          {subscriptions.map((item) => {
            const state = subscriptionState(item, today);
            const cancelling =
              typeof confirming === 'object' && confirming !== null && 'cancel' in confirming && confirming.cancel === item.id;
            return (
              <li key={item.id} className="space-y-2 rounded-xl border border-charcoal/15 p-3 text-sm">
                <p>
                  <span className="font-medium">{item.planName}</span> · {formatDate(item.startsOn)} to{' '}
                  {formatDate(item.endsOn)} · {state}
                </p>
                {item.notes && <p className="text-charcoal-soft">{item.notes}</p>}
                {!item.cancelledAt && (
                  <form
                    onSubmit={(event) => onEditSubscription(event, item.id)}
                    className="space-y-3 border-t border-charcoal/10 pt-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input
                        id={`plan-${item.id}`}
                        name="planName"
                        label="Plan name"
                        defaultValue={item.planName}
                      />
                      <Input
                        id={`starts-${item.id}`}
                        name="startsOn"
                        label="Starts on"
                        type="date"
                        defaultValue={item.startsOn}
                      />
                      <Input
                        id={`ends-${item.id}`}
                        name="endsOn"
                        label="Ends on"
                        type="date"
                        defaultValue={item.endsOn}
                      />
                    </div>
                    <Input
                      id={`notes-${item.id}`}
                      name="notes"
                      label="Notes"
                      required={false}
                      defaultValue={item.notes ?? ''}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="submit"
                        disabled={updateSubscription.isPending}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-white disabled:opacity-60 sm:w-auto"
                      >
                        Save subscription
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming({ cancel: item.id })}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
                      >
                        Cancel subscription
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.form?.reset();
                          setError(null);
                          setSaved(null);
                        }}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
                      >
                        Discard changes
                      </button>
                    </div>
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
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
          >
            Add subscription
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-alert/30 p-4">
        <h2 className="font-semibold text-alert-deep">Company actions</h2>

        {confirming === 'deactivate' &&
          confirmBox(
            `Deactivate ${company.name}? Everyone in the company will be signed out and unable to log in.`,
            'Yes, deactivate',
            () => updateCompany.mutate({ isActive: false }),
          )}
        {confirming === 'discard' &&
          confirmBox(
            `Discard ${company.name}? This permanently deletes the company, its users, subscriptions, tasks, attendance, and messages.`,
            'Yes, discard company',
            () => discardCompany.mutate(),
          )}
        {(confirming === null || typeof confirming === 'object') && (
          <div className="flex flex-col justify-end gap-2 text-sm sm:flex-row">
            {company.isActive ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming('deactivate');
                }}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
              >
                Deactivate company
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateCompany.mutate({ isActive: true })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
              >
                Reactivate company
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSaved(null);
                setConfirming('discard');
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alert px-3 py-2 text-sm text-white sm:w-auto"
            >
              Discard company
            </button>
          </div>
        )}
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
