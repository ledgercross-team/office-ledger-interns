'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { AUTH_QUERY_KEY } from '@/lib/auth-context';
import { homePath, safeNextPath } from '@/lib/navigation';
import type { AuthSession, LoginRequest } from '@/lib/types';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Incorrect email or password.';
    if (error.status === 403) return error.message;
    if (error.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  }
  return 'Something went wrong. Please try again.';
}

function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = safeNextPath(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: LoginRequest = {
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    };

    setError(null);
    setPending(true);
    try {
      const session = await apiFetch<AuthSession>('/auth/login', { method: 'POST', body });
      queryClient.setQueryData(AUTH_QUERY_KEY, session);
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      const { user } = session;
      router.replace(user.mustChangePassword ? '/change-password' : (next ?? homePath(user.role)));
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Log in to office-ledger</h1>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border px-3 py-2"
        />
      </div>
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
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
