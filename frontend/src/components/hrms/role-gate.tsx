'use client';

import type { ReactNode } from 'react';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsRole } from '@/lib/hrms/types';

// UI convenience only. The API checks every route's role itself.
export function RoleGate({ allow, children }: { allow: HrmsRole[]; children: ReactNode }) {
  const { session, isLoading } = useHrmsAuth();
  if (isLoading) return <p className="p-4 text-sm text-charcoal-soft">Loading…</p>;
  if (!session?.role || !allow.includes(session.role)) {
    return <p className="p-4 text-sm text-charcoal-soft">You don&apos;t have access to this page.</p>;
  }
  return <>{children}</>;
}
