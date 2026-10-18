'use client';

import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { HrmsShell } from '@/components/hrms/shell';
import { Skeleton } from '@/components/ui';

/**
 * Org pages render inside HrmsShell. /platform has its own gameMaster-only
 * shell, so it bypasses the org shell entirely.
 */
export function HrmsAppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/platform' || pathname.startsWith('/platform/')) {
    return <>{children}</>;
  }
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-4" aria-label="Loading application shell">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <HrmsShell>{children}</HrmsShell>
    </Suspense>
  );
}
