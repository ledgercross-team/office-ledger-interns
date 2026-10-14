'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Inbox, LogOut, ShieldCheck, Users } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, Skeleton, ToastProvider } from '@/components/ui';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

const ITEMS = [
  { href: '/platform', label: 'Organisations', icon: Building2 },
  { href: '/platform/requests', label: 'Platform requests', icon: Inbox },
  { href: '/platform/game-masters', label: 'GameMasters', icon: Users },
  { href: '/platform/security', label: 'Security', icon: ShieldCheck },
];

/**
 * Platform shell (UI-SPEC §6). gameMasters only: org pages are never linked
 * here, and org users are sent back to the dashboard.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, isLoading, logout } = useHrmsAuth();

  useEffect(() => {
    if (isLoading || !session) return;
    if (session.user.mustChangePassword) router.replace('/change-password');
    else if (!session.isGameMaster) router.replace('/');
  }, [isLoading, session, router]);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen space-y-3 bg-bg p-4 text-fg sm:p-6" aria-hidden>
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!session.isGameMaster) {
    return (
      <div className="min-h-screen space-y-3 bg-bg p-4 text-fg sm:p-6" aria-hidden>
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg text-fg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface p-3 md:block">
            <nav aria-label="Platform">
              <p className="px-2 pb-3 text-sm font-semibold text-fg">Platform console</p>
              <ul className="space-y-1">
                {ITEMS.map((item) => {
                  const active =
                    item.href === '/platform'
                      ? pathname === '/platform'
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium',
                          active
                            ? 'bg-primary-soft text-primary'
                            : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                        )}
                      >
                        <Icon aria-hidden className="size-5 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-border bg-surface">
              <div className="mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2 px-3 sm:px-6">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                  Platform console
                </p>
                <p className="hidden truncate text-sm text-fg-muted sm:block">
                  {session.user.email}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void logout()}>
                  <LogOut aria-hidden className="size-4" />
                  Sign out
                </Button>
              </div>
            </header>
            <nav
              aria-label="Platform sections"
              className="border-b border-border bg-surface md:hidden"
            >
              <ul className="flex gap-1 overflow-x-auto px-3 py-2">
                {ITEMS.map((item) => {
                  const active =
                    item.href === '/platform'
                      ? pathname === '/platform'
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-center rounded-control px-3 text-sm font-medium',
                          active
                            ? 'bg-primary-soft text-primary'
                            : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <main
              id="main-content"
              className="mx-auto w-full max-w-[1280px] flex-1 space-y-6 p-4 sm:p-6"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
