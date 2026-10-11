'use client';

import { RoleGate } from '@/components/role-gate';

export default function PeoplePage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <h1 className="text-xl font-semibold">People</h1>
    </RoleGate>
  );
}
