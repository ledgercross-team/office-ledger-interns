'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, ErrorState, Input } from '@/components/ui';
import { AuthShell } from '@/components/hrms/auth-shell';
import { OrgPicker } from '@/components/hrms/org-picker';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsSession } from '@/lib/hrms/types';

function loginError(error: unknown): string {
  if (error instanceof HrmsApiError) {
    if (error.status === 401) {
      return 'Email or password is incorrect.';
    }
    if (error.status === 429) {
      const wait = error.retryAfterSeconds;
      return `Too many attempts. Try again${wait === undefined ? ' shortly' : ` in ${wait} seconds`}.`;
    }
    if (error.status === 403) return error.message;
  }
  return 'Something went wrong. Please try again.';
}

// Only same-site absolute paths are followed after sign-in.
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { session, isLoading: sessionLoading, setSession } = useHrmsAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [authenticated, setAuthenticated] = useState<HrmsSession | null>(null);

  function afterSession(session: HrmsSession) {
    setSession(session);
    // Several memberships: the picker decides where to go.
    if (session.needsOrgSelection || (session.activeMemberId === null && !session.isGameMaster)) {
      setAuthenticated(session);
      return;
    }
    router.replace(session.isGameMaster ? '/platform' : (next ?? '/'));
  }

  // Already signed in (or a session was established outside this form):
  // never show a second login form. Derived during render; the effect below
  // only navigates.
  const pendingSelection =
    !authenticated &&
    !sessionLoading &&
    session &&
    (session.needsOrgSelection || (session.activeMemberId === null && !session.isGameMaster))
      ? session
      : null;
  // A logged-out person never sees the picker: this form can come back from the router cache
  // with its old state, so the stored session only counts while a session exists.
  const pickerSession = (session ? authenticated : null) ?? pendingSelection;

  useEffect(() => {
    if (sessionLoading || pickerSession || !session) return;
    router.replace(session.isGameMaster ? '/platform' : (next ?? '/'));
  }, [sessionLoading, session, pickerSession, next, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const session = await hrmsFetch<HrmsSession>('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      afterSession(session);
      // The router keeps this page's state while it is hidden, so nothing may stay behind.
      setPassword('');
      setPending(false);
    } catch (err) {
      if (err instanceof HrmsApiError && err.code === 'MFA_CODE_REQUIRED') {
        setCodeMode(true);
        setPassword('');
      }
      setError(loginError(err));
      setPending(false);
    }
  }

  if (pickerSession) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
        <div className="w-full max-w-[560px]">
          <OrgPicker onPicked={() => router.replace(next ?? '/')} />
        </div>
      </main>
    );
  }

  return (
    <AuthShell title="Log in">
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setCodeMode(false);
          }}
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            inputMode={codeMode ? 'numeric' : undefined}
            autoComplete={codeMode ? 'one-time-code' : 'current-password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-8 inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {showPassword ? (
              <Eye aria-hidden className="size-4" />
            ) : (
              <EyeOff aria-hidden className="size-4" />
            )}
          </button>
          <Link
            href="/forgot-password"
            className="mt-1.5 block text-right text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        {error && <ErrorState title="Could not log in" message={error} />}
        <Button type="submit" loading={pending} className="w-full">
          Log in
        </Button>
        <p className="text-center text-sm text-fg-muted">
          New to Office Ledger?{' '}
          <Link href="/landing" className="font-medium text-primary hover:underline">
            See how it works
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function HrmsLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
