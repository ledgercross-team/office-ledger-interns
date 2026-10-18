'use client';

import { RoleGate } from '@/components/hrms/role-gate';
import { SecurityCard } from '@/components/hrms/security-card';
import { PageHeader, PageShell } from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

export default function PlatformSecurityPage() {
  const { session } = useHrmsAuth();
  return (
    <RoleGate allow={['gameMaster']}>
      <PageShell>
        <PageHeader
          title="Security"
          description={`Signed in as ${session?.user.fullName} (${session?.user.email}).`}
        />
        <SecurityCard />
      </PageShell>
    </RoleGate>
  );
}
