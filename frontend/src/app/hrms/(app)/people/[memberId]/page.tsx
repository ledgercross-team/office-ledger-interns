'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS, type HrmsMember, type HrmsMemberRole } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen disabled:bg-offwhite';

export default function MemberDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const isAdmin = session?.role === 'ceo' || session?.role === 'coo';
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const queryKey = ['hrms', 'members', 'one', memberId];
  const member = useQuery({
    queryKey,
    queryFn: () => hrmsFetch<HrmsMember>(`/members/${memberId}`),
  });

  const refresh = (data: HrmsMember) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'members'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'org'] });
  };

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      hrmsFetch<HrmsMember>(`/members/${memberId}`, { method: 'PATCH', body }),
    onSuccess: (data) => {
      setError(null);
      setSaved(true);
      refresh(data);
    },
    onError: (err) => {
      setSaved(false);
      setError(message(err));
    },
  });

  const deactivate = useMutation({
    mutationFn: () => hrmsFetch<HrmsMember>(`/members/${memberId}/deactivate`, { method: 'POST' }),
    onSuccess: (data) => {
      setError(null);
      setConfirming(false);
      refresh(data);
    },
    onError: (err) => {
      setConfirming(false);
      setError(message(err));
    },
  });

  if (member.isLoading) return <p className="text-sm text-charcoal-soft">Loading…</p>;
  if (member.error || !member.data) {
    return (
      <p role="alert" className="text-sm text-alert-deep">
        {member.error ? message(member.error) : 'Member not found.'}
      </p>
    );
  }

  const m = member.data;
  const self = m.id === session?.activeMemberId;
  const canEditProfile = isAdmin || self || session?.role === 'manager';
  const canChangeRole = isAdmin && m.status === 'active';

  function onProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      designation: String(form.get('designation') ?? ''),
      department: String(form.get('department') ?? ''),
      employeeCode: String(form.get('employeeCode') ?? ''),
    };
    if (self) {
      body.fullName = String(form.get('fullName'));
      body.phone = String(form.get('phone') ?? '');
    }
    setSaved(false);
    update.mutate(body);
  }

  return (
    <>
      <div>
        <Link href="/people" className="text-sm text-evergreen hover:underline">
          ← People
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-charcoal">{m.fullName}</h1>
        <p className="text-sm text-charcoal-soft">
          {m.email} · {HRMS_ROLE_LABELS[m.role]} · {m.status}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}

      <form
        key={m.id + (m.designation ?? '') + m.fullName}
        onSubmit={onProfileSubmit}
        className="max-w-md space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4"
      >
        <h2 className="font-medium text-charcoal">Profile</h2>
        {self && (
          <>
            <label className="block space-y-1 text-sm text-charcoal">
              Full name
              <input name="fullName" defaultValue={m.fullName} className={input} />
            </label>
            <label className="block space-y-1 text-sm text-charcoal">
              Phone
              <input name="phone" defaultValue={m.phone ?? ''} className={input} />
            </label>
          </>
        )}
        <label className="block space-y-1 text-sm text-charcoal">
          Designation
          <input
            name="designation"
            defaultValue={m.designation ?? ''}
            disabled={!canEditProfile}
            className={input}
          />
        </label>
        <label className="block space-y-1 text-sm text-charcoal">
          Department
          <input
            name="department"
            defaultValue={m.department ?? ''}
            disabled={!canEditProfile}
            className={input}
          />
        </label>
        <label className="block space-y-1 text-sm text-charcoal">
          Employee code
          <input
            name="employeeCode"
            defaultValue={m.employeeCode ?? ''}
            disabled={!canEditProfile}
            className={input}
          />
        </label>
        {canEditProfile && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={update.isPending}
              className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
            >
              Save
            </button>
            {saved && <span role="status" className="text-sm text-evergreen">Saved</span>}
          </div>
        )}
      </form>

      {canChangeRole && (
        <section className="max-w-md space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
          <h2 className="font-medium text-charcoal">Role and approvals</h2>
          <label className="block space-y-1 text-sm text-charcoal">
            Role
            <select
              value={m.role}
              onChange={(event) =>
                update.mutate({ role: event.target.value as HrmsMemberRole })
              }
              className={input}
            >
              {(['employee', 'manager', 'coo', 'ceo'] as const)
                .filter((r) => session?.role === 'ceo' || r === 'employee' || r === 'manager')
                .map((r) => (
                  <option key={r} value={r}>
                    {HRMS_ROLE_LABELS[r]}
                  </option>
                ))}
            </select>
          </label>
          {m.role === 'manager' && (
            <>
              <label className="flex items-center gap-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={m.taskApprovalRequired}
                  onChange={(event) => update.mutate({ taskApprovalRequired: event.target.checked })}
                />
                Tasks this manager creates need approval
              </label>
              <label className="flex items-center gap-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={m.canViewAllProjects}
                  onChange={(event) => update.mutate({ canViewAllProjects: event.target.checked })}
                />
                Can see every project in the organisation
              </label>
            </>
          )}
        </section>
      )}

      {isAdmin && m.status !== 'deactivated' && (
        <section className="max-w-md space-y-2 rounded-2xl border border-alert/30 bg-alert-tint p-4">
          <h2 className="font-medium text-alert-deep">Deactivate</h2>
          <p className="text-sm text-charcoal">
            They are signed out of this organisation, leave every project and open task, and
            their seat is freed. Their history is kept.
          </p>
          {confirming ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate()}
                className="rounded-xl bg-alert px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Yes, deactivate
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-charcoal/15 bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-xl border border-alert px-4 py-2 text-sm text-alert-deep"
            >
              Deactivate {m.fullName}
            </button>
          )}
        </section>
      )}
    </>
  );
}
