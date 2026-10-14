'use client';

import { RoleGate } from '@/components/hrms/role-gate';
import { SecurityCard } from '@/components/hrms/security-card';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

export default function PlatformSecurityPage() {
  const { session } = useHrmsAuth();
  return (
    <RoleGate allow={['gameMaster']}>
      <h1 className="text-2xl font-semibold text-fg">Security</h1>
      <p className="text-sm text-fg-muted">
        Signed in as {session?.user.fullName} ({session?.user.email}).
      </p>
      <SecurityCard />
    </RoleGate>
  );
}
