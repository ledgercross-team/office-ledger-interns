'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';

export default function HrmsChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirm'))) {
      setError('The new passwords do not match.');
      return;
    }

    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: String(form.get('currentPassword')), newPassword },
      });
      router.replace('');
    } catch (err) {
      setError(
        err instanceof HrmsApiError && [400, 401].includes(err.status)
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setPending(false);
    }
  }

  const field = (id: string, label: string, autoComplete: string) => (
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
        minLength={id === 'currentPassword' ? 1 : 10}
        className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
      />
    </div>
  );

  return (
    <main className="flex flex-1 items-center justify-center bg-mist/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-charcoal/10 bg-white p-6"
      >
        <h1 className="text-xl font-semibold text-charcoal">Change password</h1>
        {field('currentPassword', 'Current password', 'current-password')}
        {field('newPassword', 'New password (at least 10 characters)', 'new-password')}
        {field('confirm', 'Repeat the new password', 'new-password')}
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
