'use client';

import { GameMasters } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';

export default function PlatformGameMastersPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <h1 className="text-xl font-semibold text-fg">GameMasters</h1>
      <GameMasters />
    </RoleGate>
  );
}
