'use client';

import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusPill } from '@/components/ui';
import { ORG_STATUSES } from '@/lib/hrms/status-vocabulary';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS } from '@/lib/hrms/types';

/**
 * Organisation picker (UI-SPEC §7). Shown after login when one login has
 * several memberships, and by the shell when no org is active yet.
 * Blocked orgs are disabled with their reason.
 */
export function OrgPicker({ onPicked }: { onPicked?: () => void }) {
  const { session, usableMemberships, switchOrg } = useHrmsAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  const unusable = session.memberships.filter((m) => !m.usable);

  async function pick(memberId: string) {
    setError(null);
    setPendingId(memberId);
    try {
      await switchOrg(memberId);
      onPicked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch organisation.');
      setPendingId(null);
    }
  }

  if (usableMemberships.length === 0) {
    return (
      <EmptyState
        title="No organisation available"
        description="Your memberships are suspended, deactivated, or their organisations are blocked. Ask an administrator for help."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Choose an organisation</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Signed in as {session.user.fullName} · {session.user.email}
        </p>
      </div>
      {error && <ErrorState message={error} />}
      <ul className="space-y-3">
        {usableMemberships.map((m) => (
          <li key={m.memberId}>
            <Card className="flex flex-wrap items-center gap-3">
              <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Building2 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-fg">{m.orgName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                  {HRMS_ROLE_LABELS[m.role]}
                  <StatusPill status={ORG_STATUSES[m.orgStatus]} />
                </span>
              </span>
              <Button loading={pendingId === m.memberId} onClick={() => void pick(m.memberId)}>
                Continue
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      {unusable.length > 0 && (
        <Card>
          <p className="text-sm font-medium text-fg">Not available right now</p>
          <ul className="mt-2 space-y-1 text-sm text-fg-muted">
            {unusable.map((m) => (
              <li key={m.memberId}>
                {m.orgName}:{' '}
                {m.status !== 'active' ? m.status : `organisation ${m.orgStatus.replace('_', ' ')}`}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
