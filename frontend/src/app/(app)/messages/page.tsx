'use client';

import { MessageThread } from '@/components/message-thread';
import { Reveal } from '@/components/reveal';
import { RoleGate } from '@/components/role-gate';
import { useAuth } from '@/lib/auth-context';

export default function MessagesPage() {
  const { user } = useAuth();

  return (
    <RoleGate allow={['admin']}>
      <div className="mx-auto max-w-3xl">
        <Reveal>
          {user?.companyId && (
            <MessageThread
              companyId={user.companyId}
              title="Game master"
              subtitle="Support for your subscription and account"
            />
          )}
        </Reveal>
      </div>
    </RoleGate>
  );
}
