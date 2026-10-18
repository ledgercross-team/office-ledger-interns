'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, ErrorState, Input } from '@/components/ui';
import { AuthShell } from '@/components/hrms/auth-shell';
import { PasswordStrengthMeter, passwordStrength } from '@/components/hrms/password-strength';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { HRMS_SESSION_KEY, useHrmsAuth } from '@/lib/hrms/auth-context';
import { useQueryClient } from '@tanstack/react-query';

export default function HrmsChangePasswordPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const first = session?.user.mustChangePassword === true;
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get('newPassword'));
    if (passwordStrength(next) === 'too-short') {
      setError('Use at least 10 characters.');
      return;
    }
    if (next !== String(form.get('confirm'))) {
      setError('The new passwords do not match.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: String(form.get('currentPassword')), newPassword: next },
      });
      await queryClient.invalidateQueries({ queryKey: HRMS_SESSION_KEY });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof HrmsApiError && [400, 401].includes(err.status)
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password changed">
        <p className="text-sm text-fg-muted">Use your new password next time you log in.</p>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={first ? 'Choose your own password' : 'Change password'}>
      {first && (
        <p className="mt-2 text-sm text-fg-muted">
          You signed in with a temporary password. Enter it below as the current password, then
          choose a new one to continue.
        </p>
      )}
      <form onSubmit={(event) => void onSubmit(event)} className="mt-5 space-y-4">
        <Input
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <div>
          <Input
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            helperText="At least 10 characters. Longer is stronger."
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <div className="mt-2">
            <PasswordStrengthMeter password={newPassword} />
          </div>
        </div>
        <Input
          label="Repeat the new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
        {error && <ErrorState message={error} />}
        <Button type="submit" loading={pending} className="w-full">
          Change password
        </Button>
      </form>
    </AuthShell>
  );
}
