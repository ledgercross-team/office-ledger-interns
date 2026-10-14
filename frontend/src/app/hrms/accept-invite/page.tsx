'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';

function AcceptInviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirm'))) {
      setError('The passwords do not match.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/auth/accept-invite', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof HrmsApiError && [400, 429].includes(err.status)
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setPending(false);
    }
  }

  const box = 'w-full max-w-sm space-y-4 rounded-2xl border border-charcoal/10 bg-white p-6';
  if (done) {
    return (
      <div className={box}>
        <h1 className="text-xl font-semibold text-charcoal">Password set</h1>
        <p className="text-sm text-charcoal-soft">You can now log in with your email and password.</p>
        <Link
          href="/login"
          className="block rounded-xl bg-evergreen px-3 py-2.5 text-center font-medium text-white hover:bg-evergreen-dark"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  const input =
    'w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen';
  return (
    <form onSubmit={onSubmit} className={box}>
      <h1 className="text-xl font-semibold text-charcoal">Set your password</h1>
      {!token && (
        <p role="alert" className="text-sm text-alert-deep">
          This link is incomplete. Open the link from your invite again.
        </p>
      )}
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        New password (at least 10 characters)
        <input name="password" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        Repeat the password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !token}
        className="w-full rounded-xl bg-evergreen px-3 py-2.5 font-medium text-white hover:bg-evergreen-dark disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-mist/40 p-4">
      <Suspense>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
