'use client';

import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { HrmsShell } from '@/components/hrms/shell';

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
    <Suspense fallback={<p className="p-4 text-sm text-fg-muted">Loading…</p>}>
      <HrmsShell>{children}</HrmsShell>
    </Suspense>
  );
}
