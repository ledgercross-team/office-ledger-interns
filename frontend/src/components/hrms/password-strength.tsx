'use client';

import { cn } from '@/lib/cn';

export type PasswordStrength = 'too-short' | 'weak' | 'fair' | 'strong';

/**
 * Strength meter. The API enforces only length (10–128 characters), so the
 * meter is honest about that: length bands, no composition claims.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 10) return 'too-short';
  if (password.length < 14) return 'weak';
  if (password.length < 20) return 'fair';
  return 'strong';
}

const STRENGTH_TEXT: Record<PasswordStrength, string> = {
  'too-short': 'Use at least 10 characters.',
  weak: 'Weak — a longer password is harder to guess.',
  fair: 'Fair — longer is stronger.',
  strong: 'Strong password.',
};

const STRENGTH_LEVEL: Record<PasswordStrength, number> = {
  'too-short': 0,
  weak: 1,
  fair: 2,
  strong: 3,
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  const level = STRENGTH_LEVEL[strength];
  return (
    <div className="space-y-1">
      <div role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={3} aria-valuenow={level} aria-valuetext={STRENGTH_TEXT[strength]} className="flex gap-1">
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            aria-hidden
            className={cn(
              'h-1.5 flex-1 rounded-full',
              segment <= level ? (level >= 3 ? 'bg-success' : level === 2 ? 'bg-warning' : 'bg-danger') : 'bg-surface-sunken',
            )}
          />
        ))}
      </div>
      <p aria-live="polite" className="text-xs text-fg-muted">{password.length === 0 ? 'Use at least 10 characters.' : STRENGTH_TEXT[strength]}</p>
    </div>
  );
}
