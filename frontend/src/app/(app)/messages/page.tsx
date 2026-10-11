'use client';

import { MessageThread } from '@/components/message-thread';
import { RoleGate } from '@/components/role-gate';
import { useAuth } from '@/lib/auth-context';

export default function MessagesPage() {
  const { user } = useAuth();

  return (
    <RoleGate allow={['admin']}>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Messages with the game master</h1>
        {user?.companyId && <MessageThread companyId={user.companyId} />}
      </div>
    </RoleGate>
  );
}
