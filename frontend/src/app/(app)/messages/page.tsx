'use client';

import { MessageThread } from '@/components/message-thread';
import { Reveal } from '@/components/reveal';
import { RoleGate } from '@/components/role-gate';
import { useAuth } from '@/lib/auth-context';

export default function MessagesPage() {
  const { user } = useAuth();

  return (
    <RoleGate allow={['admin']}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-forest">
                  <span className="h-1.5 w-1.5 rounded-full bg-evergreen" aria-hidden />
                  Support inbox
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Messages</h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-charcoal-soft">
                  Have a question about your account or subscription? Start a conversation with the game master.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-charcoal/10 bg-white px-3 py-2 text-xs text-charcoal-soft shadow-[0_1px_2px_rgba(28,43,37,0.04)]">
                <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-evergreen">
                  <path d="M12 22a10 10 0 1 0-10-10c0 1.8.48 3.49 1.32 4.96L2 22l5.04-1.32A9.96 9.96 0 0 0 12 22Z" />
                  <path d="M8 12h.01M12 12h.01M16 12h.01" />
                </svg>
                Private support channel
              </div>
            </div>

            {user?.companyId && (
              <MessageThread
                companyId={user.companyId}
                title="Game master"
                subtitle="Support for your subscription and account"
              />
            )}
          </div>
        </Reveal>
      </div>
    </RoleGate>
  );
}
