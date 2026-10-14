'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, ErrorState, PageHeader, Skeleton, StatusPill } from '@/components/ui';
import { SeatBar } from '@/components/hrms/seat-bar';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { ORG_STATUSES } from '@/lib/hrms/status-vocabulary';
import { HRMS_ROLE_LABELS, type HrmsOrg } from '@/lib/hrms/types';

/**
 * Home/Dashboard entry. Per-role dashboard panels arrive with the dashboard
 * step; this keeps the profile header, active-org card and seat usage.
 */
export default function HrmsHomePage() {
  const { session } = useHrmsAuth();
  const canSeeSeats = session?.role === 'ceo' || session?.role === 'coo';

  const org = useQuery({
    queryKey: ['hrms', 'org', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: Boolean(session?.org),
    retry: false,
  });

  if (!session) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.user.fullName}
        description={session.user.email}
        primaryAction={
          <Button asChild variant="secondary">
            <Link href="/change-password">Change password</Link>
          </Button>
        }
      />

      {org.isLoading && (
        <Card className="space-y-3" aria-hidden>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
        </Card>
      )}
      {org.error && <ErrorState message="Could not load the organisation." onRetry={() => void org.refetch()} />}

      {session.org && session.role && (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={session.user.fullName} size="lg" />
            <div>
              <p className="text-xs text-fg-muted">Active organisation</p>
              <p className="text-lg font-semibold text-fg">{session.org.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                {HRMS_ROLE_LABELS[session.role]}
                <StatusPill status={ORG_STATUSES[session.org.status]} />
              </p>
            </div>
          </div>
          {canSeeSeats && org.data?.seats && <SeatBar seats={org.data.seats} />}
        </Card>
      )}
    </div>
  );
}
