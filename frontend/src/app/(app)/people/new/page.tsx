'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/hrms/role-gate';
import {
  Banner,
  Button,
  Card,
  Input,
  PageHeader,
  PageShell,
  Select,
  cardClass,
  linkClass,
} from '@/components/ui';
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
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['hrms', 'org'] });
      setDone(response);
    } catch (err) {
      // The database's rule message (seat limit, who may add whom) is shown as is.
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (done?.member) {
    return (
      <PageShell className="max-w-2xl">
        <PageHeader title="Person added" description="Share the next sign-in step securely." />
        <Card className="max-w-md space-y-3">
          <p className="text-lg font-semibold text-success-fg">{done.member.fullName} was added</p>
          {done.temporaryPassword ? (
            <div
              role="status"
              className="space-y-1 rounded-control border border-success/30 bg-success-soft p-3"
            >
              <p className="text-sm text-fg">Temporary password for {done.member.email}</p>
              <p className="select-all font-mono text-base tabular-nums text-fg">
                {done.temporaryPassword}
              </p>
              <p className="text-xs text-fg-muted">
                Give this to them yourself. It is shown only now, and they must choose their own
                password the first time they sign in.
              </p>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">
              {done.invited
                ? 'They can set a password from the invite link.'
                : 'They already have a login, so they can use this organisation straight away.'}
            </p>
          )}
          <div className="flex gap-3 text-sm">
            <Link href={`/people/${done.member.id}`} className={linkClass}>
              Open profile
            </Link>
            <Link href="/people" className={linkClass}>
              Back to people
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-2xl">
      <PageHeader
        title="Add person"
        description="Create an organisation member and choose the access level they need."
      />
      <form onSubmit={onSubmit} className={`${cardClass} max-w-md space-y-4`}>
        <Input label="Email" name="email" type="email" required />
        <Input label="Full name" name="fullName" required maxLength={120} />
        <Select label="Role" name="role" defaultValue="employee">
          {roles.map((r) => (
            <option key={r} value={r}>
              {HRMS_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Input label="Designation (optional)" name="designation" maxLength={100} />
        <Input label="Department (optional)" name="department" maxLength={100} />
        <Input
          label="Employee code"
          value="Assigned automatically"
          readOnly
          disabled
          helperText="A unique code (EMP-0001, EMP-0002…) is given when they are added. It is permanent."
        />
        {error && (
          <Banner tone="danger" title="Could not add person">
            {error}
          </Banner>
        )}
        <Button type="submit" loading={pending} loadingLabel="Adding">
          Add person
        </Button>
      </form>
    </PageShell>
  );
}

export default function NewMemberPage() {
  return (
    <RoleGate allow={['ceo', 'coo']}>
      <NewMemberForm />
    </RoleGate>
  );
}
