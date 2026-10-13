'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/format';
import type { CreateUserResponse, ManagerOption } from '@/lib/types';

function NewPersonForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateUserResponse | null>(null);
  const [role, setRole] = useState('employee');

  // Next keeps a page's state when you navigate away, so drop the password explicitly on leave.
  useEffect(() => () => setCreated(null), []);

  // Both admins and managers may explicitly choose an active manager, or leave the employee unassigned.
  const managers = useQuery({
    queryKey: ['people', 'managers'],
    queryFn: () => apiFetch<{ items: ManagerOption[] }>('/users/managers'),
    enabled: user?.role === 'admin' || user?.role === 'manager',
  });

  const create = useMutation({
    mutationFn: (body: {
      fullName: string;
      email: string;
      role: string;
      jobTitle?: string;
      managerId?: string;
    }) =>
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
    const managerId = String(form.get('managerId') ?? '');

    setError(null);
    create.mutate({
      fullName: String(form.get('fullName')).trim(),
      email: String(form.get('email')).trim(),
      role: String(form.get('role')),
      jobTitle: jobTitle || undefined,
      managerId: role === 'employee' && managerId ? managerId : undefined,
    });
  }

  if (created) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">{created.user.fullName} was added</h1>
        <TemporaryPasswordPanel password={created.temporaryPassword} />
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2"
          >
            Add another
          </button>
          <Link href="/people" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-charcoal/15 px-3 py-2">
            Back to people
          </Link>
        </div>
      </div>
    );
  }

  // A manager can only add employees; the API enforces this too.
  const isAdmin = user?.role === 'admin';

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
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
          className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
          className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="role" className="block text-sm font-medium">
          Role
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        >
          <option value="employee">Employee</option>
          {isAdmin && <option value="manager">Manager</option>}
          {isAdmin && <option value="admin">Admin</option>}
        </select>
      </div>
      {(isAdmin || user?.role === 'manager') && role === 'employee' && (
        <div className="space-y-1">
          <label htmlFor="managerId" className="block text-sm font-medium">
            Assign to manager (optional)
          </label>
          <select
            id="managerId"
            name="managerId"
            defaultValue=""
            className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
          >
            <option value="">Leave unassigned</option>
            {managers.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="jobTitle" className="block text-sm font-medium">
          Job title (optional)
        </label>
        <input
          id="jobTitle"
          name="jobTitle"
          maxLength={120}
          className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2"
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
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-4 py-2 text-white disabled:opacity-60 sm:w-auto"
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
