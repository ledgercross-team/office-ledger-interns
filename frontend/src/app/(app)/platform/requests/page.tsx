'use client';

import { Requests } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';

export default function PlatformRequestsPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <h1 className="text-xl font-semibold text-fg">Platform requests</h1>
      <Requests />
    </RoleGate>
  );
}
