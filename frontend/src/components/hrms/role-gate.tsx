'use client';

import type { ReactNode } from 'react';
import { FullPageState } from '@/components/hrms/full-page-state';
import { Skeleton } from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsRole } from '@/lib/hrms/types';

// UI convenience only. The API checks every route's role itself.
export function RoleGate({ allow, children }: { allow: HrmsRole[]; children: ReactNode }) {
  const { session, isLoading } = useHrmsAuth();
  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!session?.role || !allow.includes(session.role)) {
    return <FullPageState kind="forbidden" embedded />;
  }
  return <>{children}</>;
}
