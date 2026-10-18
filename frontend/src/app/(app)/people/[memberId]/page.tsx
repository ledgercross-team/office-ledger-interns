'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Card,
  ErrorState,
  Skeleton,
  cardClass,
  controlClass,
  labelClass,
  linkClass,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS, type HrmsMember, type HrmsMemberRole } from '@/lib/hrms/types';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

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
  const requireMfa = useMutation({
    mutationFn: () => hrmsFetch(`/members/${memberId}/require-mfa`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      setNotice('They will be asked to set up the authenticator at their next sign-in.');
      void queryClient.invalidateQueries({ queryKey });
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

  const authenticator = { isPending: resetMfa.isPending || requireMfa.isPending };

  if (member.isLoading) {
    return (
      <div className="max-w-md space-y-3" aria-label="Loading member profile">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (member.error || !member.data) {
    return (
      <ErrorState
        title="Could not load member"
        message={member.error ? message(member.error) : 'Member not found.'}
        onRetry={() => void member.refetch()}
      />
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
        <Link href="/people" className={`text-sm ${linkClass}`}>
          ← People
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-fg">{m.fullName}</h1>
        <p className="text-sm text-fg-muted">
          {m.email} · {HRMS_ROLE_LABELS[m.role]} · {m.status}
        </p>
      </div>

      {error && (
        <Banner tone="danger" title="Could not save changes">
          {error}
        </Banner>
      )}

      <form
        key={m.id + (m.designation ?? '') + m.fullName}
        onSubmit={onProfileSubmit}
        className={`max-w-md space-y-3 ${cardClass}`}
      >
        <h2 className="font-medium text-fg">Profile</h2>
        {self && (
          <>
            <label className={labelClass}>
              Full name
              <input name="fullName" defaultValue={m.fullName} className={controlClass} />
            </label>
            <label className={labelClass}>
              Phone
              <input name="phone" defaultValue={m.phone ?? ''} className={controlClass} />
            </label>
          </>
        )}
        <label className={labelClass}>
          Designation
          <input
            name="designation"
            defaultValue={m.designation ?? ''}
            disabled={!canEditProfile}
            className={controlClass}
          />
        </label>
        <label className={labelClass}>
          Department
          <input
            name="department"
            defaultValue={m.department ?? ''}
            disabled={!canEditProfile}
            className={controlClass}
          />
        </label>
        <label className={labelClass}>
          Employee code
          <input
            value={m.employeeCode ?? ''}
            readOnly
            disabled
            aria-describedby="employee-code-note"
            className={`${controlClass} cursor-not-allowed`}
          />
          <span id="employee-code-note" className="block text-xs font-normal text-fg-muted">
            Assigned automatically and permanent. It cannot be changed.
          </span>
        </label>
        {canEditProfile && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success-fg">
                Saved
              </span>
            )}
          </div>
        )}
      </form>

      {canChangeRole && (
        <Card className="max-w-md space-y-3">
          <h2 className="font-medium text-fg">Role and approvals</h2>
          <label className={labelClass}>
            Role
            <select
              value={m.role}
              onChange={(event) => update.mutate({ role: event.target.value as HrmsMemberRole })}
              className={controlClass}
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
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={m.taskApprovalRequired}
                  onChange={(event) =>
                    update.mutate({ taskApprovalRequired: event.target.checked })
                  }
                  className="size-4 accent-primary"
                />
                Tasks this manager creates need approval
              </label>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={m.canViewAllProjects}
                  onChange={(event) => update.mutate({ canViewAllProjects: event.target.checked })}
                  className="size-4 accent-primary"
                />
                Can see every project in the organisation
              </label>
            </>
          )}
        </Card>
      )}

      {isAdmin &&
        m.id !== session?.activeMemberId &&
        m.role !== 'ceo' &&
        (session?.role === 'ceo' || m.role !== 'coo') && (
          <Card className="max-w-md space-y-2">
            <h2 className="font-medium text-fg">Password and authenticator</h2>
            <p className="text-sm text-fg-muted">
              Give them a new one-time password. It is shown once, they must choose their own at the
              next sign-in, and they are signed out everywhere.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={resetPassword.isPending}
              onClick={() => resetPassword.mutate()}
            >
              Reset password
            </Button>
            {tempPassword && (
              <div
                role="status"
                className="space-y-1 rounded-control border border-success/30 bg-success-soft p-3"
              >
                <p className="text-sm text-fg">New temporary password for {m.email}</p>
                <p className="select-all font-mono text-base tabular-nums text-fg">
                  {tempPassword}
                </p>
                <p className="text-xs text-fg-muted">Shown only now. Give it to them yourself.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTempPassword(null)}
                >
                  I have shared it
                </Button>
              </div>
            )}
            <h3 className="pt-2 text-sm font-medium text-fg">Authenticator</h3>
            <p className="text-sm text-fg-muted">
              If they lost their phone, turn their authenticator off so they can sign in with their
              password again.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={m.mfaEnabled === true || m.mfaSetupRequired === true}
                aria-label="Authenticator"
                disabled={authenticator.isPending}
                onClick={() =>
                  m.mfaEnabled || m.mfaSetupRequired ? resetMfa.mutate() : requireMfa.mutate()
                }
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed ${
                  m.mfaEnabled
                    ? 'border-primary bg-primary'
                    : m.mfaSetupRequired
                      ? 'border-warning bg-warning'
                      : 'border-border-strong bg-surface-sunken'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                    m.mfaEnabled || m.mfaSetupRequired ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium ${
                  m.mfaEnabled
                    ? 'text-success-fg'
                    : m.mfaSetupRequired
                      ? 'text-warning-fg'
                      : 'text-fg-muted'
                }`}
              >
                {authenticator.isPending
                  ? 'Saving…'
                  : m.mfaEnabled
                    ? 'On: tap to turn off'
                    : m.mfaSetupRequired
                      ? 'Required: waiting for them to set it up (tap to cancel)'
                      : 'Off: tap to require it'}
              </span>
            </div>
            <p className="text-xs text-fg-muted">
              {m.mfaEnabled
                ? 'They sign in with the 6-digit code from their app.'
                : m.mfaSetupRequired
                  ? 'At their next sign-in they must scan the code in their profile before anything else works.'
                  : 'Requiring it makes them set it up at their next sign-in. Only their phone can hold the secret, so you never see it.'}
            </p>
            {notice && (
              <Banner tone="success" title="Authenticator updated">
                {notice}
              </Banner>
            )}
          </Card>
        )}

      {isAdmin && m.status !== 'deactivated' && (
        <Card className="max-w-md space-y-2 border-danger/30 bg-danger-soft">
          <h2 className="font-medium text-danger-fg">Deactivate</h2>
          <p className="text-sm text-fg">
            They are signed out of this organisation, leave every project and open task, and their
            seat is freed. Their history is kept.
          </p>
          {confirming ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate()}
              >
                Yes, deactivate
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
              Deactivate {m.fullName}
            </Button>
          )}
        </Card>
      )}
    </>
  );
}
