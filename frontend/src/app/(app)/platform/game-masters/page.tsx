'use client';

import { GameMasters } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';
import { PageHeader, PageShell } from '@/components/ui';

export default function PlatformGameMastersPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <PageShell>
        <PageHeader
          title="GameMasters"
          description="Manage the people who operate the platform console."
        />
        <GameMasters />
      </PageShell>
    </RoleGate>
  );
}
