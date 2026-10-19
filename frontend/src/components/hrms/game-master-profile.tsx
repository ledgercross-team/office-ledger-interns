'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ErrorState,
  Input,
  PageHeader,
  PageShell,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsSession } from '@/lib/hrms/types';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg">{value || '—'}</dd>
    </div>
  );
}

export function GameMasterProfile({ session }: { session: HrmsSession }) {
  const { setSession } = useHrmsAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(session.user.fullName);
  const [email, setEmail] = useState(session.user.email);
  const [notice, setNotice] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (body: { fullName: string; email: string }) =>
      hrmsFetch<{ userId: string }>(`/platform/game-masters/${session.user.id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (_, body) => {
      setSession({ ...session, user: { ...session.user, ...body } });
      setNotice('Your profile details were updated.');
      setEditing(false);
    },
  });
  const error = update.error
    ? update.error instanceof HrmsApiError
      ? update.error.message
      : 'Could not update your profile. Please try again.'
    : null;

  function startEditing() {
    update.reset();
    setNotice(null);
    setFullName(session.user.fullName);
    setEmail(session.user.email);
    setEditing(true);
  }

  function cancelEditing() {
    update.reset();
    setFullName(session.user.fullName);
    setEmail(session.user.email);
    setEditing(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { fullName: fullName.trim(), email: email.trim().toLowerCase() };
    if (!next.fullName || !next.email) return;
    setNotice(null);
    update.mutate(next);
  }

  return (
    <PageShell className="mx-auto max-w-[768px]">
      <PageHeader
        title="Profile"
        description="Review and manage the account you use to operate Office Ledger."
      />
      <Card className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={session.user.fullName} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-fg">{session.user.fullName}</p>
              <p className="text-sm text-fg-muted">Game master · Platform console</p>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={startEditing}>
              Edit profile
            </Button>
          )}
        </div>

        {notice && (
          <Banner tone="success" title="Profile updated">
            {notice}
          </Banner>
        )}

        {editing ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                maxLength={120}
                required
              />
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                helperText="This is also the email used to sign in."
                maxLength={254}
                required
              />
            </div>
            {error && <ErrorState title="Could not save profile" message={error} />}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={update.isPending}>
                Save changes
              </Button>
              <Button variant="ghost" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Full name" value={session.user.fullName} />
            <Field label="Email" value={session.user.email} />
            <Field label="Role" value="Game master" />
            <Field label="Account status" value="Active" />
            <Field label="Time zone" value={session.user.timezone} />
            <Field label="Authenticator" value={session.user.mfaEnabled ? 'On' : 'Off'} />
          </dl>
        )}
      </Card>
    </PageShell>
  );
}
