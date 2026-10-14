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
  const [notice, setNotice] = useState<string | null>(null);

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

  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const resetPassword = useMutation({
    mutationFn: () =>
      hrmsFetch<{ temporaryPassword: string }>(`/members/${memberId}/reset-password`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setError(null);
      setTempPassword(data.temporaryPassword);
    },
    onError: (err) => setError(message(err)),
  });
  const resetMfa = useMutation({
    mutationFn: () => hrmsFetch(`/members/${memberId}/reset-mfa`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      setNotice('Authenticator turned off. They can sign in with their password again.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(message(err)),
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
            value={m.employeeCode ?? ''}
            readOnly
            disabled
            aria-describedby="employee-code-note"
            className={`${input} cursor-not-allowed bg-charcoal/5 text-charcoal-soft`}
          />
          <span id="employee-code-note" className="block text-xs font-normal text-charcoal-soft">
            Assigned automatically and permanent. It cannot be changed.
          </span>
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
            {saved && (
              <span role="status" className="text-sm text-evergreen">
                Saved
              </span>
            )}
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
              onChange={(event) => update.mutate({ role: event.target.value as HrmsMemberRole })}
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
                  onChange={(event) =>
                    update.mutate({ taskApprovalRequired: event.target.checked })
                  }
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

      {isAdmin &&
        m.id !== session?.activeMemberId &&
        m.role !== 'ceo' &&
        (session?.role === 'ceo' || m.role !== 'coo') && (
          <section className="max-w-md space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
            <h2 className="font-medium text-charcoal">Password and authenticator</h2>
            <p className="text-sm text-charcoal-soft">
              Give them a new one-time password. It is shown once, they must choose their own at the
              next sign-in, and they are signed out everywhere.
            </p>
            <button
              type="button"
              disabled={resetPassword.isPending}
              onClick={() => resetPassword.mutate()}
              className="rounded-xl border border-charcoal/15 bg-white px-4 py-2 text-sm disabled:opacity-60"
            >
              Reset password
            </button>
            {tempPassword && (
              <div role="status" className="space-y-1 rounded-xl border border-forest/30 p-3">
                <p className="text-sm text-charcoal">New temporary password for {m.email}</p>
                <p className="select-all font-mono text-base tabular-nums text-charcoal">
                  {tempPassword}
                </p>
                <p className="text-xs text-charcoal-soft">
                  Shown only now. Give it to them yourself.
                </p>
                <button
                  type="button"
                  onClick={() => setTempPassword(null)}
                  className="text-sm text-forest hover:underline"
                >
                  I have shared it
                </button>
              </div>
            )}
            <h3 className="pt-2 text-sm font-medium text-charcoal">Authenticator</h3>
            <p className="text-sm text-charcoal-soft">
              If they lost their phone, turn their authenticator off so they can sign in with their
              password again.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={m.mfaEnabled === true}
                aria-label="Authenticator"
                disabled={resetMfa.isPending || m.mfaEnabled !== true}
                onClick={() => resetMfa.mutate()}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed ${
                  m.mfaEnabled
                    ? 'border-evergreen bg-evergreen'
                    : 'border-charcoal/20 bg-charcoal/15'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                    m.mfaEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium ${m.mfaEnabled ? 'text-forest' : 'text-charcoal-soft'}`}
              >
                {resetMfa.isPending ? 'Turning off…' : m.mfaEnabled ? 'On: tap to turn off' : 'Off'}
              </span>
            </div>
            {m.mfaEnabled !== true && (
              <p className="text-xs text-charcoal-soft">
                Off. Only the person can turn it on, from their own profile.
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-forest">
                {notice}
              </p>
            )}
          </section>
        )}

      {isAdmin && m.status !== 'deactivated' && (
        <section className="max-w-md space-y-2 rounded-2xl border border-alert/30 bg-alert-tint p-4">
          <h2 className="font-medium text-alert-deep">Deactivate</h2>
          <p className="text-sm text-charcoal">
            They are signed out of this organisation, leave every project and open task, and their
            seat is freed. Their history is kept.
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
