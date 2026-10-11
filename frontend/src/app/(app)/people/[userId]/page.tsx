'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { ApiError, apiFetch } from '@/lib/api-client';
import { errorMessage, formatDateTime } from '@/lib/format';
import type { User } from '@/lib/types';

type Confirming = 'deactivate' | 'reset' | null;

function PersonDetail() {
  const { userId } = useParams<{ userId: string }>();
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

  const update = useMutation({
    mutationFn: (body: Partial<Pick<User, 'fullName' | 'jobTitle' | 'isActive'>>) =>
      apiFetch<User>(`/users/${userId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setConfirming(null);
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
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{person.fullName}</h1>
        <p className="text-sm text-charcoal-soft">
          {person.email} · <span className="capitalize">{person.role}</span> ·{' '}
          {person.isActive ? 'Active' : 'Inactive'}
          {person.lastLoginAt && ` · last login ${formatDateTime(person.lastLoginAt)}`}
        </p>
      </div>

      {temporaryPassword && <TemporaryPasswordPanel password={temporaryPassword} />}

      <form onSubmit={onSave} className="space-y-3 rounded-lg border p-4">
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
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
          />
        </div>
        {saved && <p className="text-sm text-evergreen">Saved.</p>}
        <button
          type="submit"
          disabled={update.isPending}
          className="rounded-xl bg-evergreen px-3 py-1 text-sm text-white disabled:opacity-60"
        >
          Save changes
        </button>
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Account</h2>

        {confirming === 'deactivate' ? (
          <div role="alertdialog" aria-label="Confirm deactivation" className="space-y-2 text-sm">
            <p>
              Deactivate {person.fullName}? They will be signed out and unable to log in.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ isActive: false })}
                className="rounded-xl bg-alert px-3 py-1 text-white disabled:opacity-60"
              >
                Yes, deactivate
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
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
            <div className="flex gap-2">
              <button
                type="button"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
                className="rounded-xl bg-alert px-3 py-1 text-white disabled:opacity-60"
              >
                Yes, reset password
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {person.isActive ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming('deactivate');
                }}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ isActive: true })}
                className="rounded-xl border border-charcoal/15 px-3 py-1"
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
              className="rounded-xl border border-charcoal/15 px-3 py-1"
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
      </section>
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
