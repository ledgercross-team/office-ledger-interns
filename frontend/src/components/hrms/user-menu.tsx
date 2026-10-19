'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar, DropdownMenu, useToast } from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS } from '@/lib/hrms/types';

/**
 * User menu (UI-SPEC §5): account identity, org switching, Profile, and
 * (when enabled) Sign out.
 */
export function UserMenu({ showSignOut = true }: { showSignOut?: boolean }) {
  const { session, usableMemberships, switchOrg, logout } = useHrmsAuth();
  const toast = useToast();
  const router = useRouter();

  if (!session) return null;
  const roleLabel = session.role ? HRMS_ROLE_LABELS[session.role] : null;

  function switchTo(memberId: string, orgName: string) {
    void switchOrg(memberId).catch((err: unknown) =>
      toast({
        title: `Could not switch to ${orgName}`,
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      }),
    );
  }

  const items = [
    {
      label: `${session.user.fullName} · ${session.user.email}${roleLabel ? ` · ${roleLabel}` : ''}`,
      disabled: true,
    },
    ...(usableMemberships.length > 1
      ? usableMemberships
          .filter((m) => m.memberId !== session.activeMemberId)
          .map((m) => ({
            label: `Switch to ${m.orgName} (${HRMS_ROLE_LABELS[m.role]})`,
            onSelect: () => switchTo(m.memberId, m.orgName),
          }))
      : []),
    {
      label: 'Profile',
      onSelect: () => router.push(session.isGameMaster ? '/platform/profile' : '/profile'),
    },
    ...(showSignOut
      ? [
          {
            label: 'Sign out',
            icon: <LogOut aria-hidden className="size-4" />,
            onSelect: () => void logout(),
          },
        ]
      : []),
  ];

  return (
    <DropdownMenu
      label="Account"
      trigger={
        <button
          type="button"
          aria-label={`Account: ${session.user.fullName}`}
          className="rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Avatar name={session.user.fullName} size="sm" />
        </button>
      }
      items={items}
    />
  );
}
