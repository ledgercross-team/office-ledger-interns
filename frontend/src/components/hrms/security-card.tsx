'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { Banner, Button, Card, ErrorState, Input } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { HRMS_SESSION_KEY, useHrmsAuth } from '@/lib/hrms/auth-context';

type Step = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'newCodes';

const fail = (err: unknown) =>
  err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.';

/** Saves the codes as a plain .txt file, built in the browser (nothing is sent anywhere). */
function downloadCodes(email: string, codes: string[]): void {
  const text = [
    'office-ledger backup codes',
    `Account: ${email}`,
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Each code works once, in place of the 6-digit code from your authenticator app.',
    'Keep this file somewhere safe and private.',
    '',
    ...codes,
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'office-ledger-backup-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Profile → Security. The authenticator is off by default. Turning it on needs
 * the password, a scan and a valid code; from then on sign-in asks for the
 * code instead of the password. Turning it off needs a current code.
 */
export function SecurityCard() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const enabled = session?.user.mfaEnabled === true;
  const [step, setStep] = useState<Step>('idle');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(fail(err));
    } finally {
      setPending(false);
    }
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: HRMS_SESSION_KEY });

  function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    void run(async () => {
      setSetup(await hrmsFetch('/auth/mfa/setup', { method: 'POST', body: { password } }));
      setStep('scan');
    });
  }

  function onEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    void run(async () => {
      const result = await hrmsFetch<{ backupCodes: string[] }>('/auth/mfa/enable', {
        method: 'POST',
        body: { code },
      });
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setStep('codes');
      await refresh();
    });
  }

  function onNewCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    void run(async () => {
      const result = await hrmsFetch<{ backupCodes: string[] }>('/auth/mfa/backup-codes', {
        method: 'POST',
        body: { code },
      });
      setBackupCodes(result.backupCodes);
      setStep('codes');
    });
  }

  function onDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    void run(async () => {
      await hrmsFetch('/auth/mfa/disable', { method: 'POST', body: { code } });
      setStep('idle');
      await refresh();
    });
  }

  return (
    <Card id="security" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Security</h2>
        <p className="text-sm text-fg-muted">
          Authenticator app: <strong>{enabled ? 'on' : 'off'}</strong>.{' '}
          {enabled
            ? 'You sign in with the 6-digit code from your app instead of your password.'
            : 'Turn it on to sign in with a 6-digit code instead of your password.'}
        </p>
      </div>

      {session?.user.mfaSetupRequired && !enabled && (
        <Banner tone="warning" title="Your administrator requires the authenticator.">
          Turn it on below and confirm a code. Nothing else works until you have.
        </Banner>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Authenticator app"
          disabled={step !== 'idle'}
          onClick={() => setStep(enabled ? 'disable' : 'password')}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled ? 'border-primary bg-primary' : 'border-border-strong bg-surface-sunken'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${enabled ? 'text-success-fg' : 'text-fg-muted'}`}>
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      {step === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {enabled && (
            <Button variant="secondary" onClick={() => setStep('newCodes')}>
              New backup codes
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href="/change-password">Change password</Link>
          </Button>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={onPassword} className="max-w-sm space-y-3">
          <Input
            label="Your password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && <ErrorState message={error} />}
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('idle');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={onEnable} className="max-w-sm space-y-3">
          <p className="text-sm text-fg">
            Scan this with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <div className="inline-block rounded-card border border-border bg-white p-3">
            <QRCodeSVG value={setup.otpauthUrl} size={160} />
          </div>
          <p className="text-xs text-fg-muted">
            Can&apos;t scan? Enter this key:{' '}
            <code className="break-all font-mono text-fg">{setup.secret}</code>
          </p>
          <Input
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
          />
          {error && <ErrorState message={error} />}
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Turn on
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('idle');
                setSetup(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="space-y-3">
          <Banner tone="success" title="Authenticator is on.">
            Save these backup codes now. Each works once in place of the 6-digit code, and they are
            not shown again. Any older backup codes no longer work.
          </Banner>
          <ul className="grid max-w-sm grid-cols-2 gap-2 font-mono text-sm tabular-nums">
            {backupCodes.map((c) => (
              <li
                key={c}
                className="rounded-control border border-border bg-surface-sunken px-3 py-2"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadCodes(session?.user.email ?? '', backupCodes)}
            >
              Download .txt
            </Button>
            <Button
              onClick={() => {
                setBackupCodes([]);
                setStep('idle');
              }}
            >
              I have saved them
            </Button>
          </div>
        </div>
      )}

      {step === 'newCodes' && (
        <form onSubmit={onNewCodes} className="max-w-sm space-y-3">
          <Input
            label="Current 6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            helperText="You get 5 new backup codes. Your old ones stop working."
          />
          {error && <ErrorState message={error} />}
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Create 5 new codes
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('idle');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'disable' && (
        <form onSubmit={onDisable} className="max-w-sm space-y-3">
          <Input
            label="Current code or a backup code"
            name="code"
            autoComplete="one-time-code"
            maxLength={12}
            required
            helperText="After this you sign in with your password again."
          />
          {error && <ErrorState message={error} />}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={pending}>
              Turn off
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('idle');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
