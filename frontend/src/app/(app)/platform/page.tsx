'use client';

import { Orgs } from '@/components/hrms/platform-orgs';
import { RoleGate } from '@/components/hrms/role-gate';
import { PageHeader, PageShell } from '@/components/ui';

export default function PlatformOrgsPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <PageShell>
        <PageHeader
          title="Organisations"
          description="Monitor organisation access, status, and platform-level activity."
        />
        <Orgs />
      </PageShell>
    </RoleGate>
  );
}
