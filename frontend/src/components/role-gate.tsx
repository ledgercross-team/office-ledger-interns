'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { Role } from '@/lib/types';

interface RoleGateProps {
  allow: Role[];
  children: ReactNode;
}

export function RoleGate({ allow, children }: RoleGateProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p className="p-4 text-sm text-neutral-500">Loading…</p>;
  }

  if (!user || !allow.includes(user.role)) {
    return <p className="p-4 text-sm text-neutral-500">You don&apos;t have access to this page</p>;
  }

  return <>{children}</>;
}
