'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsSession } from '@/lib/hrms/types';

function errorText(error: unknown): string {
  if (error instanceof HrmsApiError) {
    if (error.status === 401) return 'Incorrect email or password.';
    if (error.status === 403) return error.message;
    if (error.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
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

interface MfaChallenge {
  mfaRequired: true;
  mfaEnrollmentRequired: boolean;
  mfaToken: string;
}

function isChallenge(value: HrmsSession | MfaChallenge): value is MfaChallenge {
  return 'mfaRequired' in value;
}

const field =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen';
const button =
  'w-full rounded-xl bg-evergreen px-3 py-2.5 font-medium text-white transition-colors hover:bg-evergreen-dark disabled:opacity-60';

/** The one-time code step. A first sign-in shows the secret to put in an authenticator app. */
function MfaStep({
  challenge,
  onSession,
}: {
  challenge: MfaChallenge;
  onSession: (session: HrmsSession) => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!challenge.mfaEnrollmentRequired) return;
    hrmsFetch<{ secret: string }>('/auth/mfa/enroll', {
      method: 'POST',
      body: { mfaToken: challenge.mfaToken },
      skipAuthRefresh: true,
    })
      .then((r) => setSecret(r.secret))
      .catch((err) => setError(errorText(err)));
  }, [challenge]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    setError(null);
    setPending(true);
    try {
      const session = await hrmsFetch<HrmsSession>('/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: challenge.mfaToken, code },
        skipAuthRefresh: true,
      });
      onSession(session);
    } catch (err) {
      setError(err instanceof HrmsApiError && err.status === 401 ? err.message : errorText(err));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-charcoal/10 bg-white p-6"
    >
      <h1 className="text-xl font-semibold text-charcoal">
        {challenge.mfaEnrollmentRequired ? 'Set up two-step sign-in' : 'Enter your code'}
      </h1>
      {challenge.mfaEnrollmentRequired && (
        <div className="space-y-2 text-sm text-charcoal">
          <p>
            Add this key to an authenticator app (time-based, 6 digits), then type the code it shows.
          </p>
          <p className="break-all rounded-xl bg-mist p-3 font-mono text-sm" aria-label="Secret key">
            {secret ?? 'Loading…'}
          </p>
        </div>
      )}
      <label className="block space-y-1 text-sm font-medium text-charcoal">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}

function LoginForm() {
  const router = useRouter();
  const { setSession } = useHrmsAuth();
  const next = safeNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const session = await hrmsFetch<HrmsSession | MfaChallenge>('/auth/login', {
        method: 'POST',
        body: { email: String(form.get('email')).trim(), password: String(form.get('password')) },
      });
      if (isChallenge(session)) {
        setChallenge(session);
        setPending(false);
        return;
      }
      setSession(session);
      router.replace(next ?? '/');
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  if (challenge) {
    return (
      <MfaStep
        challenge={challenge}
        onSession={(session) => {
          setSession(session);
          router.replace(next ?? '/');
        }}
      />
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-charcoal/10 bg-white p-6 shadow-[0_8px_24px_rgba(19,78,58,0.10)]"
    >
      <div className="space-y-1">
        <p className="text-lg font-semibold text-forest">office-ledger</p>
        <h1 className="text-xl font-semibold text-charcoal">Log in</h1>
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-charcoal">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-charcoal">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2 outline-none focus:border-evergreen"
        />
      </div>
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
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}

export default function HrmsLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-mist/40 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
