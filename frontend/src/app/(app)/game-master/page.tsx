'use client';

import { RoleGate } from '@/components/role-gate';

export default function GameMasterPage() {
  return (
    <RoleGate allow={['game_master']}>
      <h1 className="text-xl font-semibold">Companies</h1>
    </RoleGate>
  );
}
