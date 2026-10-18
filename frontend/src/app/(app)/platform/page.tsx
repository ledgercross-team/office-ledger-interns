'use client';

import { Orgs } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';

export default function PlatformOrgsPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <h1 className="text-xl font-semibold text-fg">Organisations</h1>
      <Orgs />
    </RoleGate>
  );
}
