'use client';

import { MessagesApp } from '@/components/hrms/messages-app';
import { RoleGate } from '@/components/hrms/role-gate';

export default function PlatformMessagesPage() {
  return (
    <RoleGate allow={['gameMaster']}>
      <MessagesApp mode="platform" />
    </RoleGate>
  );
}
