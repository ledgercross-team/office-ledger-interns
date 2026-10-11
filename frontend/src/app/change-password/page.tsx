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
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        className="w-full rounded border px-3 py-2"
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
    <main className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Change your password</h1>
        {user?.mustChangePassword && (
          <p className="text-sm text-neutral-600">
            Choose your own password before you continue.
          </p>
        )}
        <Field id="currentPassword" label="Current password" autoComplete="current-password" />
        <Field id="newPassword" label="New password" autoComplete="new-password" />
        <Field id="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </main>
  );
}
