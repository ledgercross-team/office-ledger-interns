'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Card, ErrorState, Input } from '@/components/ui';
import { OrgPicker } from '@/components/hrms/org-picker';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsSession } from '@/lib/hrms/types';

function loginError(error: unknown): string {
  if (error instanceof HrmsApiError) {
    if (error.status === 401) {
      // The server says so when this email uses an authenticator (or the code was wrong).
      return error.code === 'MFA_CODE_REQUIRED' || error.message === 'The code is not correct.'
        ? error.message
        : 'Email or password is incorrect.';
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

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-[480px]">
        <p className="text-lg font-semibold text-primary">office-ledger</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <div className="mt-5">{children}</div>
      </Card>
    </main>
  );
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
  const pickerSession = authenticated ?? pendingSelection;

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
    <AuthCard title="Log in">
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
        <div>
          <Input
            label={codeMode ? 'Authenticator code' : 'Password or authenticator code'}
            helperText="If you turned on the authenticator, enter its 6-digit code (or a backup code) instead of your password."
            type={showPassword || codeMode ? 'text' : 'password'}
            inputMode={codeMode ? 'numeric' : undefined}
            autoComplete={codeMode ? 'one-time-code' : 'current-password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <>
                  <EyeOff aria-hidden className="size-4" />
                  Hide password
                </>
              ) : (
                <>
                  <Eye aria-hidden className="size-4" />
                  Show password
                </>
              )}
            </Button>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        {error && <ErrorState title="Could not log in" message={error} />}
        <Button type="submit" loading={pending} className="w-full">
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}

export default function HrmsLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
