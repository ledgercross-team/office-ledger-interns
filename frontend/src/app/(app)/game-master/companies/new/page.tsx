'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { DateInput } from '@/components/date-input';
import { TemporaryPasswordPanel } from '@/components/temporary-password-panel';
import { TimezoneSelect } from '@/components/timezone-select';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import type { CreateCompanyResponse } from '@/lib/types';

function Field({
  id,
  label,
  type = 'text',
  defaultValue,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {type === 'date' ? (
        <DateInput
          id={id}
          name={id}
          defaultValue={defaultValue}
          required
          className="w-full rounded-xl border border-charcoal/15 bg-white"
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          defaultValue={defaultValue}
          required
          className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2"
        />
      )}
    </div>
  );
}

function NewCompanyForm() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateCompanyResponse | null>(null);
  // Next keeps a page's state when you navigate away, so drop the password explicitly on leave.
  useEffect(() => () => setCreated(null), []);

  const create = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch<CreateCompanyResponse>('/game-master/companies', { method: 'POST', body }),
    onSuccess: async (result) => {
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      body[key] = String(value).trim();
    }

    setError(null);
    create.mutate(body);
  }

  if (created) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">{created.company.name} was created</h1>
        <p className="text-sm">
          Admin: {created.admin.fullName} ({created.admin.email})
        </p>
        <TemporaryPasswordPanel password={created.temporaryPassword} />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={`/game-master/companies/${created.company.id}`}
            className="rounded-xl border border-charcoal/15 px-3 py-1"
          >
            Open company
          </Link>
          <Link href="/game-master" className="rounded-xl border border-charcoal/15 px-3 py-1">
            Back to companies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New company</h1>

      <Field id="companyName" label="Company name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TimezoneSelect id="timezone" label="Timezone" />
        <Field id="workStartTime" label="Work start time" type="time" defaultValue="09:00" />
      </div>

      <h2 className="pt-2 font-semibold">Admin</h2>
      <Field id="adminFullName" label="Admin full name" />
      <Field id="adminEmail" label="Admin email" type="email" />

      <h2 className="pt-2 font-semibold">First subscription</h2>
      <Field id="planName" label="Plan name" defaultValue="Standard" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="startsOn" label="Starts on" type="date" />
        <Field id="endsOn" label="Ends on" type="date" />
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
        {create.isPending ? 'Creating…' : 'Create company'}
      </button>
    </form>
  );
}

export default function NewCompanyPage() {
  return (
    <RoleGate allow={['game_master']}>
      <NewCompanyForm />
    </RoleGate>
  );
}
