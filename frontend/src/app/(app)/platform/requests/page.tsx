'use client';

import { Requests } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import { PageHeader, PageShell } from '@/components/ui';

export default function PlatformRequestsPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <PageShell>
        <PageHeader
          title="Platform requests"
          description="Review requests that need platform-level action."
        />
        <Requests />
      </PageShell>
    </RoleGate>
  );
}
