'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/format';
import type { CreateUserResponse } from '@/lib/types';

function NewPersonForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateUserResponse | null>(null);

  // Next keeps a page's state when you navigate away, so drop the password explicitly on leave.
  useEffect(() => () => setCreated(null), []);

  const create = useMutation({
    mutationFn: (body: { fullName: string; email: string; role: string; jobTitle?: string }) =>
      apiFetch<CreateUserResponse>('/users', { method: 'POST', body }),
    onSuccess: async (result) => {
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const jobTitle = String(form.get('jobTitle')).trim();

    setError(null);
    create.mutate({
      fullName: String(form.get('fullName')).trim(),
      email: String(form.get('email')).trim(),
      role: String(form.get('role')),
      jobTitle: jobTitle || undefined,
    });
  }

  if (created) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">{created.user.fullName} was added</h1>
        <TemporaryPasswordPanel password={created.temporaryPassword} />
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="rounded-xl border border-charcoal/15 px-3 py-1"
          >
            Add another
          </button>
          <Link href="/people" className="rounded-xl border border-charcoal/15 px-3 py-1">
            Back to people
          </Link>
        </div>
      </div>
    );
  }

  // A manager can only add employees; the API enforces this too.
  const canAddManagers = user?.role === 'admin';

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Add person</h1>

      <div className="space-y-1">
        <label htmlFor="fullName" className="block text-sm font-medium">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          maxLength={120}
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="role" className="block text-sm font-medium">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="employee"
          className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        >
          <option value="employee">Employee</option>
          {canAddManagers && <option value="manager">Manager</option>}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="jobTitle" className="block text-sm font-medium">
          Job title (optional)
        </label>
        <input
          id="jobTitle"
          name="jobTitle"
          maxLength={120}
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-xl bg-evergreen px-4 py-2 text-white disabled:opacity-60"
      >
        {create.isPending ? 'Adding…' : 'Add person'}
      </button>
    </form>
  );
}

export default function NewPersonPage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <NewPersonForm />
    </RoleGate>
  );
}
