'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { NAV_ICONS } from '@/components/nav-icons';
import { useAuth } from '@/lib/auth-context';
import type { Role } from '@/lib/types';
import { NAV_BY_ROLE, ROLE_LABELS } from '@/lib/navigation';

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name.split(' ')[0]}`;
}

function todayLine(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {NAV_BY_ROLE[role].map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-evergreen text-white' : 'text-mist/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              {NAV_ICONS[item.href]}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname() is runtime data, so nav lives in its own component under <Suspense>.
function Sidebar({ role, fullName }: { role: Role; fullName: string }) {
  const { logout } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-forest p-4 text-white md:flex">
      <p className="px-2 py-3 text-lg font-semibold tracking-tight">office-ledger</p>
      <nav aria-label="Main" className="mt-2 flex-1">
        <Suspense fallback={null}>
          <NavLinks role={role} />
        </Suspense>
      </nav>
      <div className="rounded-xl bg-white/10 p-3 text-sm">
        <p className="font-medium">{fullName}</p>
        <p className="text-mist/70">{ROLE_LABELS[role]}</p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-2 w-full rounded-lg border border-white/25 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [isLoading, user, router]);

  if (!user || user.mustChangePassword) {
    return <p className="p-4 text-sm text-charcoal-soft">Loading…</p>;
  }

  const subscriptionEnded = user.role === 'admin' && user.subscriptionActive === false;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} fullName={user.fullName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-charcoal/10 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-charcoal">{greeting(user.fullName)}</p>
              <p className="text-sm text-charcoal-soft">{todayLine()}</p>
            </div>
            <div className="flex items-center gap-3 text-sm md:hidden">
              <span className="text-charcoal-soft">{ROLE_LABELS[user.role]}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-charcoal/15 px-3 py-1.5"
              >
                Log out
              </button>
            </div>
          </div>
          <nav aria-label="Main" className="mt-3 md:hidden">
            <Suspense fallback={null}>
              <div className="slim-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <MobileLinks role={user.role} />
              </div>
            </Suspense>
          </nav>
        </header>
        {subscriptionEnded && (
          <p role="alert" className="border-b border-brand-amber/40 bg-amber-tint px-4 py-2 text-sm text-amber-deep sm:px-6">
            Your company&apos;s subscription has ended. Managers and employees cannot log in.{' '}
            <Link href="/subscription" className="font-medium underline">
              View subscription
            </Link>{' '}
            or message the game master to renew.
          </p>
        )}
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function MobileLinks({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <>
      {NAV_BY_ROLE[role].map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              active ? 'bg-forest text-white' : 'bg-mist text-forest'
            }`}
          >
            {NAV_ICONS[item.href]}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
