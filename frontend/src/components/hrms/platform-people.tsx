'use client';

import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

type Mode = 'idle' | 'edit' | 'confirmRemove';

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
          <button
            type="button"
            className={secondary}
            disabled={pending}
            onClick={() => setMode('confirmRemove')}
          >
            {removeLabel}
          </button>
        )}
      </div>

      {mode === 'edit' && (
        <form onSubmit={onEdit} className="grid max-w-lg gap-2 sm:grid-cols-2">
          <label className="block space-y-1 text-xs text-charcoal-soft">
            Full name
            <input
              name="fullName"
              defaultValue={fullName}
              required
              maxLength={120}
              className={input}
            />
          </label>
          <label className="block space-y-1 text-xs text-charcoal-soft">
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

      {mode === 'confirmRemove' && (
        <div
          role="alertdialog"
          aria-label={`Remove ${fullName}`}
          className="max-w-lg space-y-2 rounded-xl border border-alert/30 bg-alert-tint p-3 text-sm"
        >
          <p className="text-charcoal">
            {removeLabel} <strong>{fullName}</strong>? They are signed out and can no longer sign
            in. Their history is kept.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-alert px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                void run('/remove', { method: 'POST' }, () => {
                  setMode('idle');
                  setNotice('Removed.');
                })
              }
            >
              Yes, {removeLabel.toLowerCase()}
            </button>
            <button type="button" className={secondary} onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {password && (
        <div
          role="status"
          className="max-w-lg space-y-1 rounded-xl border border-forest/30 p-3 text-sm"
        >
          <p className="text-charcoal">New temporary password for {email}</p>
          <p className="select-all font-mono text-base tabular-nums text-charcoal">{password}</p>
          <p className="text-xs text-charcoal-soft">
            Shown only now. Give it to them yourself; they choose their own at the next sign-in and
            are signed out everywhere.
          </p>
          <button type="button" className={secondary} onClick={() => setPassword(null)}>
            I have shared it
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-forest">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
    </div>
  );
}
