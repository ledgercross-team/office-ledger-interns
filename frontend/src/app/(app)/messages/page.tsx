'use client';

import { MessagesApp } from '@/components/hrms/messages-app';
import { RoleGate } from '@/components/hrms/role-gate';

export default function MessagesPage() {
  return (
    <RoleGate allow={['ceo', 'coo', 'manager', 'employee']}>
      <MessagesApp mode="org" />
    </RoleGate>
  );
}
