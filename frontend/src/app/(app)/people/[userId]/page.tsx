'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { PersonInsights } from '@/components/attendance-insights';
import { RoleGate } from '@/components/role-gate';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDateTime } from '@/lib/format';
import type { ManagerOption, User } from '@/lib/types';

type Confirming = 'deactivate' | 'reset' | null;

function PersonDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { user: caller } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  // Next keeps a page's state when you navigate away, so drop the password explicitly on leave.
  useEffect(() => () => setTemporaryPassword(null), []);

  const query = useQuery({
    queryKey: ['people', 'detail', userId],
    queryFn: () => apiFetch<User>(`/users/${userId}`),
  });

  // Needed to hand an employee to another manager.
  const managers = useQuery({
    queryKey: ['people', 'managers'],
    queryFn: () => apiFetch<{ items: ManagerOption[] }>('/users/managers'),
    enabled: query.data?.role === 'employee',
  });

  const update = useMutation({
    mutationFn: (body: {
      fullName?: string;
      jobTitle?: string;
      isActive?: boolean;
      managerId?: string | null;
    }) =>
      apiFetch<User>(`/users/${userId}`, { method: 'PATCH', body }),
    onSuccess: async (_person, variables) => {
      setConfirming(null);
      // A manager who hands an employee over can no longer open them, so leave the page first.
      if (caller?.role === 'manager' && variables.managerId && variables.managerId !== caller.id) {
        router.replace('/people');
      }
      await queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const reset = useMutation({
    mutationFn: () =>
      apiFetch<{ temporaryPassword: string }>(`/users/${userId}/reset-password`, { method: 'POST' }),
    onSuccess: (result) => {
      setConfirming(null);
      setTemporaryPassword(result.temporaryPassword);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) {
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

  const person = query.data;
  const canManage =
    caller?.role === 'admin' ||
    (caller?.role === 'manager' && person.role === 'employee' && person.managerId === caller.id);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    update.mutate(
      {
        fullName: String(form.get('fullName')).trim(),
        jobTitle: String(form.get('jobTitle')).trim(),
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{person.fullName}</h1>
        <p className="text-sm text-charcoal-soft">
          {person.email} · <span className="capitalize">{person.role}</span> ·{' '}
          {person.isActive ? 'Active' : 'Inactive'}
          {person.lastLoginAt && ` · last login ${formatDateTime(person.lastLoginAt)}`}
          {person.role === 'employee' && ` · reports to ${person.managerName ?? 'nobody yet'}`}
        </p>
      </div>

      {temporaryPassword && <TemporaryPasswordPanel password={temporaryPassword} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {canManage ? (
          <form onSubmit={onSave} className="space-y-3 rounded-lg border p-4 lg:col-span-2">
            <h2 className="font-semibold">Details</h2>
            <div className="space-y-1">
              <label htmlFor="fullName" className="block text-sm font-medium">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                defaultValue={person.fullName}
                required
                maxLength={120}
                className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="jobTitle" className="block text-sm font-medium">
                Job title
              </label>
              <input
                id="jobTitle"
                name="jobTitle"
                defaultValue={person.jobTitle ?? ''}
                maxLength={120}
                className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
              />
            </div>
            {saved && <p className="text-sm text-evergreen">Saved.</p>}
            <button
              type="submit"
              disabled={update.isPending}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
            >
              Save changes
            </button>
          </form>
        ) : (
          <section className="space-y-3 rounded-lg border p-4 lg:col-span-2">
            <h2 className="font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-charcoal-soft">Full name</dt>
                <dd className="font-medium text-charcoal">{person.fullName}</dd>
              </div>
              <div>
                <dt className="text-charcoal-soft">Job title</dt>
                <dd className="font-medium text-charcoal">{person.jobTitle ?? '—'}</dd>
              </div>
            </dl>
            <p className="text-sm text-charcoal-soft">Only the employee’s assigned manager can edit these details.</p>
          </section>
        )}

      {person.role === 'employee' && (
        canManage ? (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">Reports to</h2>
            {caller?.role === 'manager' && (
              <p className="text-sm text-charcoal-soft">
                Choosing another manager hands this person over. They will leave your team.
              </p>
            )}
            <form
              key={person.managerId ?? 'none'}
              onSubmit={(event) => {
                event.preventDefault();
                const value = String(new FormData(event.currentTarget).get('managerId'));
                setError(null);
                update.mutate({ managerId: value === '' ? null : value });
              }}
              className="space-y-3"
            >
              <label htmlFor="managerId" className="block text-sm font-medium">
                Manager
              </label>
              <select
                id="managerId"
                name="managerId"
                defaultValue={person.managerId ?? ''}
                className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
              >
                {caller?.role === 'admin' && <option value="">No manager yet</option>}
                {managers.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={update.isPending}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm text-white disabled:opacity-60 sm:w-auto"
              >
                {update.isPending ? 'Saving…' : 'Change manager'}
              </button>
            </form>
          </section>
        ) : (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">Reports to</h2>
            <p className="text-sm text-charcoal-soft">{person.managerName ?? 'No manager assigned'}</p>
          </section>
        ))}

      {canManage && <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Account</h2>

        {confirming === 'deactivate' ? (
          <div role="alertdialog" aria-label="Confirm deactivation" className="space-y-2 text-sm">
            <p>
              Deactivate {person.fullName}? They will be signed out and unable to log in.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ isActive: false })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alert px-3 py-2 text-white disabled:opacity-60 sm:w-auto"
              >
                Yes, deactivate
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
        ) : confirming === 'reset' ? (
          <div role="alertdialog" aria-label="Confirm password reset" className="space-y-2 text-sm">
            <p>
              Reset the password for {person.fullName}? Their current sessions will be signed out.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alert px-3 py-2 text-white disabled:opacity-60 sm:w-auto"
              >
                Yes, reset password
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
        ) : (
          <div className="flex flex-col gap-2 text-sm sm:flex-row">
            {person.isActive ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming('deactivate');
                }}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ isActive: true })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
              >
                Reactivate
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTemporaryPassword(null);
                setConfirming('reset');
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2 sm:w-auto"
            >
              Reset password
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
      </section>}
      </div>

      {person.role !== 'admin' && (
        <section aria-label="Attendance insights" className="space-y-3">
          <h2 className="text-lg font-semibold text-charcoal">Check-in and check-out tendencies</h2>
          <PersonInsights
            path={`/attendance/stats/users/${person.id}`}
            name={person.fullName.split(' ')[0]}
          />
        </section>
      )}
    </div>
  );
}

export default function PersonDetailPage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <PersonDetail />
    </RoleGate>
  );
}
