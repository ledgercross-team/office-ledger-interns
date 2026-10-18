'use client';

import { useParams } from 'next/navigation';
import { OrgManage } from '@/components/hrms/platform-parts';
import { RoleGate } from '@/components/hrms/role-gate';

export default function PlatformOrgPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RoleGate allow={['gameMaster']}>
      <OrgManage orgId={id} />
    </RoleGate>
  );
}
