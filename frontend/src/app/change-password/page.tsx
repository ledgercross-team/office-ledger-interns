'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { AUTH_QUERY_KEY, useAuth } from '@/lib/auth-context';
import { homePath } from '@/lib/navigation';
import type { ChangePasswordRequest } from '@/lib/types';

function Field({ id, label, autoComplete }: { id: string; label: string; autoComplete: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-charcoal">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
      />
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));

    if (newPassword.length < 10 || newPassword.length > 128) {
      setError('New password must be 10 to 128 characters.');
      return;
    }
    if (newPassword !== String(form.get('confirmPassword'))) {
      setError('New password and confirmation do not match.');
      return;
    }

    setError(null);
    setPending(true);
    try {
      const body: ChangePasswordRequest = { currentPassword, newPassword };
      await apiFetch('/auth/change-password', { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      router.replace(user ? homePath(user.role) : '/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-mist/40 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-charcoal/10 bg-white p-6 shadow-[0_8px_24px_rgba(19,78,58,0.10)]">
        <h1 className="text-xl font-semibold text-charcoal">Change your password</h1>
        {user?.mustChangePassword && (
          <p className="text-sm text-charcoal-soft">
            Choose your own password before you continue.
          </p>
        )}
        <Field id="currentPassword" label="Current password" autoComplete="current-password" />
        <Field id="newPassword" label="New password" autoComplete="new-password" />
        <Field id="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-evergreen px-3 py-2.5 font-medium text-white transition-colors hover:bg-evergreen-dark disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </main>
  );
}
