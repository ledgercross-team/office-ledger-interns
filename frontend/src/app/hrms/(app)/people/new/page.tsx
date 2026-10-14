'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS, type CreateMemberResponse, type HrmsMemberRole } from '@/lib/hrms/types';

function NewMemberForm() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreateMemberResponse | null>(null);
  const [pending, setPending] = useState(false);

  const roles: HrmsMemberRole[] =
    session?.role === 'ceo' ? ['employee', 'manager', 'coo', 'ceo'] : ['employee', 'manager'];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => String(form.get(key) ?? '').trim() || undefined;
    setError(null);
    setPending(true);
    try {
      const response = await hrmsFetch<CreateMemberResponse>('/members', {
        method: 'POST',
        body: {
          email: String(form.get('email')).trim(),
          fullName: String(form.get('fullName')).trim(),
          role: String(form.get('role')),
          designation: optional('designation'),
          department: optional('department'),
          employeeCode: optional('employeeCode'),
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'org'] });
      setDone(response);
    } catch (err) {
      // The database's rule message (seat limit, who may add whom) is shown as is.
      setError(err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (done?.member) {
    return (
      <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
        <p className="text-lg font-semibold text-forest">{done.member.fullName} was added</p>
        <p className="text-sm text-charcoal-soft">
          {done.invited
            ? 'They can set a password from the invite link.'
            : 'They already have a login, so they can use this organisation straight away.'}
        </p>
        <div className="flex gap-3 text-sm">
          <Link href={`/people/${done.member.id}`} className="text-evergreen hover:underline">
            Open profile
          </Link>
          <Link href="/people" className="text-evergreen hover:underline">
            Back to people
          </Link>
        </div>
      </section>
    );
  }

  const input =
    'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
  return (
    <form
      onSubmit={onSubmit}
      className="max-w-md space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4"
    >
      <h1 className="text-xl font-semibold text-charcoal">Add person</h1>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Email
        <input name="email" type="email" required className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Full name
        <input name="fullName" required maxLength={120} className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Role
        <select name="role" className={input} defaultValue="employee">
          {roles.map((r) => (
            <option key={r} value={r}>
              {HRMS_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Designation (optional)
        <input name="designation" maxLength={100} className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Department (optional)
        <input name="department" maxLength={100} className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Employee code (optional)
        <input name="employeeCode" maxLength={50} className={input} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
      >
        {pending ? 'Adding…' : 'Add person'}
      </button>
    </form>
  );
}

export default function NewMemberPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <NewMemberForm />
    </RoleGate>
  );
}
