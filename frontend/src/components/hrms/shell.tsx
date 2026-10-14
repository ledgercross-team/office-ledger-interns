'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { NotificationBell } from '@/components/hrms/notification-bell';
import { OrgSwitcher } from '@/components/hrms/org-switcher';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { HRMS_ROLE_LABELS, type HrmsRole } from '@/lib/hrms/types';

interface NavItem {
  href: string;
  label: string;
  roles: HrmsRole[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Home', roles: ['ceo', 'coo', 'manager', 'employee', 'gameMaster'] },
  { href: '/platform', label: 'Platform', roles: ['gameMaster'] },
  { href: '/projects', label: 'Projects', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/tasks', label: 'Tasks', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/attendance', label: 'Attendance', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/calendar', label: 'Calendar', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/leave', label: 'Leave', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/requests', label: 'Requests', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/invites', label: 'Invites', roles: ['ceo', 'coo', 'manager', 'employee'] },
  { href: '/workload', label: 'Workload', roles: ['ceo', 'coo', 'manager'] },
  { href: '/ratings', label: 'Ratings', roles: ['manager', 'employee'] },
  { href: '/performance', label: 'Performance', roles: ['ceo', 'coo'] },
  { href: '/history', label: 'History', roles: ['ceo', 'coo'] },
  { href: '/people', label: 'People', roles: ['ceo', 'coo', 'manager'] },
  { href: '/settings', label: 'Organisation', roles: ['ceo', 'coo'] },
];

export function HrmsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, isLoading, logout } = useHrmsAuth();

  useEffect(() => {
    if (!isLoading && !session) router.replace('/login');
  }, [isLoading, session, router]);

  if (isLoading || !session) {
    return <p className="p-4 text-sm text-charcoal-soft">Loading…</p>;
  }

  const items = NAV.filter((item) => session.role && item.roles.includes(session.role));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-charcoal/10 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 p-3 sm:px-8">
          <span className="font-semibold text-forest">office-ledger</span>
          {session.org && session.role && (
            <span className="text-sm text-charcoal-soft">
              {session.org.name} · {HRMS_ROLE_LABELS[session.role]}
            </span>
          )}
          <nav className="flex flex-1 flex-wrap gap-1" aria-label="Main">
            {items.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    active ? 'bg-mist text-forest' : 'text-charcoal hover:bg-mist/60'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <NotificationBell />
          <OrgSwitcher />
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm text-charcoal hover:bg-mist/60"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-8">{children}</main>
    </div>
  );
}
