'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Banner } from '@/components/ui';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsOrg } from '@/lib/hrms/types';

/**
 * Organisation status banners (UI-SPEC §5). Rendered at the top of the
 * content on every shell page. Suspended and blocked orgs are gated by the
 * shell itself; these banners cover read-only mode and seat warnings.
 */
export function OrgBanners() {
  const { session } = useHrmsAuth();
  const role = session?.role;
  const status = session?.org?.status;
  const seesSeats = role === 'ceo' || role === 'coo';

  const org = useQuery({
    queryKey: ['hrms', 'org', 'banners', session?.activeMemberId],
    queryFn: () => hrmsFetch<HrmsOrg>('/org'),
    enabled: seesSeats && session?.org !== null,
    staleTime: 60_000,
    retry: false,
  });

  if (!session?.org) return null;
  const seats = org.data?.seats;
  const warning = seats?.warningLevel ?? null;

  return (
    <div className="space-y-3">
      {status === 'read_only' && (
        <Banner tone="warning" title="This organisation is read-only until the subscription is renewed.">
          You can view but not change anything.
        </Banner>
      )}
      {seesSeats && warning !== null && (
        <Banner
          tone={warning === 100 ? 'danger' : 'warning'}
          title={
            warning === 100
              ? 'All seats are in use.'
              : `You have used ${warning}% of available seats.`
          }
        >
          <Link href="/people" className="font-medium underline underline-offset-2">
            Review people
          </Link>{' '}
          to free a seat or renew the subscription.
        </Banner>
      )}
    </div>
  );
}
