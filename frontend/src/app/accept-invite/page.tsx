'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, ErrorState, Input } from '@/components/ui';
import { PasswordStrengthMeter, passwordStrength } from '@/components/hrms/password-strength';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';

/**
 * First-password screen for invite links and CEO recovery links. Both token
 * purposes are consumed by the same endpoint.
 */
function AcceptInviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordStrength(password) === 'too-short') {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/auth/accept-invite', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      if (err instanceof HrmsApiError && [400, 404, 410].includes(err.status)) {
        setError('This link has expired or was already used. Ask the person who invited you — or your CEO — for a new one.');
      } else {
        setError(err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.');
      }
      setPending(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
        <Card className="w-full max-w-[480px] space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Password set</h1>
          <p className="text-sm text-fg-muted">You can now log in with your email and password.</p>
          <Button asChild className="w-full">
            <Link href="/login">Go to log in</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-[480px]">
        <p className="text-lg font-semibold text-primary">office-ledger</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Set your password</h1>
        <form onSubmit={(event) => void onSubmit(event)} className="mt-5 space-y-4">
          {!token && (
            <ErrorState message="This link is incomplete. Open the link from your invite again, or ask the sender for a new one." />
          )}
          <div>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              helperText="At least 10 characters. Longer is stronger."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <div className="mt-2">
              <PasswordStrengthMeter password={password} />
            </div>
          </div>
          <Input
            label="Repeat the password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error && <ErrorState message={error} />}
          <Button type="submit" loading={pending} disabled={!token} className="w-full">
            Set password
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}
