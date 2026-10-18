'use client';

import { useState, type FormEvent } from 'react';
import {
  Banner,
  ConfirmDialog,
  cardClass,
  controlClass,
  labelClass,
  primaryActionClass,
  secondaryActionClass,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';

const input = controlClass;
const primary = primaryActionClass;
const secondary = secondaryActionClass;

type Mode = 'idle' | 'edit';

/**
 * Update and remove for a gameMaster or an org's CEO. `base` is the API path of the
 * person (`/platform/game-masters/:userId` or `/platform/ceos/:memberId`).
 * A new password is shown once; the person must change it at their next sign-in.
 */
export function PersonManager({
  base,
  fullName,
  email,
  canRemove,
  removeLabel = 'Remove',
  onChanged,
}: {
  base: string;
  fullName: string;
  email: string;
  canRemove: boolean;
  removeLabel?: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(
    path: string,
    options: { method: 'POST' | 'PATCH'; body?: unknown },
    after: (data: unknown) => void,
  ) {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const data = await hrmsFetch<unknown>(`${base}${path}`, {
        ...options,
        body: options.body ?? {},
      });
      after(data);
      onChanged();
    } catch (err) {
      setError(
        err instanceof HrmsApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  function onEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void run(
      '',
      {
        method: 'PATCH',
        body: { fullName: String(f.get('fullName')).trim(), email: String(f.get('email')).trim() },
      },
      () => {
        setMode('idle');
        setNotice('Saved.');
      },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          disabled={pending}
          onClick={() => setMode(mode === 'edit' ? 'idle' : 'edit')}
        >
          Edit
        </button>
        <button
          type="button"
          className={secondary}
          disabled={pending}
          onClick={() =>
            void run('/reset-password', { method: 'POST' }, (data) =>
              setPassword((data as { temporaryPassword: string }).temporaryPassword),
            )
          }
        >
          Reset password
        </button>
        <button
          type="button"
          className={secondary}
          disabled={pending}
          onClick={() =>
            void run('/reset-mfa', { method: 'POST' }, () => setNotice('Authenticator turned off.'))
          }
        >
          Turn off authenticator
        </button>
        {canRemove && (
          <ConfirmDialog
            trigger={
              <button type="button" className={secondary} disabled={pending}>
                {removeLabel}
              </button>
            }
            title={`${removeLabel} ${fullName}?`}
            description={`They will be signed out and can no longer sign in. Their history will be kept.`}
            confirmLabel={`Yes, ${removeLabel.toLowerCase()}`}
            variant="danger"
            loading={pending}
            onConfirm={() =>
              run('/remove', { method: 'POST' }, () => {
                setMode('idle');
                setNotice('Removed.');
              })
            }
          />
        )}
      </div>

      {mode === 'edit' && (
        <form onSubmit={onEdit} className="grid max-w-lg gap-2 sm:grid-cols-2">
          <label className={`${labelClass} text-xs`}>
            Full name
            <input
              name="fullName"
              defaultValue={fullName}
              required
              maxLength={120}
              className={input}
            />
          </label>
          <label className={`${labelClass} text-xs`}>
            Email
            <input
              name="email"
              type="email"
              defaultValue={email}
              required
              maxLength={254}
              className={input}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={primary} disabled={pending}>
              Save
            </button>
            <button type="button" className={secondary} onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {password && (
        <div
          role="status"
          className={`max-w-lg space-y-1 ${cardClass} border-success/30 bg-success-soft text-sm`}
        >
          <p className="text-fg">New temporary password for {email}</p>
          <p className="select-all font-mono text-base tabular-nums text-fg">{password}</p>
          <p className="text-xs text-fg-muted">
            Shown only now. Give it to them yourself; they choose their own at the next sign-in and
            are signed out everywhere.
          </p>
          <button type="button" className={secondary} onClick={() => setPassword(null)}>
            I have shared it
          </button>
        </div>
      )}
      {notice && (
        <Banner tone="success" title="Person updated">
          {notice}
        </Banner>
      )}
      {error && (
        <Banner tone="danger" title="Could not update person">
          {error}
        </Banner>
      )}
    </div>
  );
}
