'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Inbox, LogOut, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Avatar, Button, Skeleton, ToastProvider } from '@/components/ui';
import { BrandMark } from '@/components/hrms/brand';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { UserMenu } from '@/components/hrms/user-menu';

const ITEMS = [
  { href: '/platform', label: 'Organisations', icon: Building2 },
  { href: '/platform/requests', label: 'Platform requests', icon: Inbox },
  { href: '/platform/game-masters', label: 'GameMasters', icon: Users },
  { href: '/platform/messages', label: 'Messages', icon: MessageSquare },
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
  const isGm = Boolean(session?.isGameMaster);
  const unread = useQuery({
    queryKey: ['hrms', 'messages', 'unread', 'platform'],
    queryFn: () => hrmsFetch<{ messages: number }>('/platform/messages/unread-count'),
    enabled: isGm,
    refetchInterval: 10_000,
    retry: false,
  });
  const unreadCount = unread.data?.messages ?? 0;

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
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-bg p-3 pr-2 md:block">
            <nav
              aria-label="Platform"
              className="flex h-full flex-col gap-4 rounded-card border border-border bg-rail p-3 text-rail-fg"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1 pt-1">
                  <BrandMark />
                  <span className="truncate text-base font-semibold tracking-[-0.02em]">
                    Office Ledger
                  </span>
                </div>
                <div className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-2.5 py-2">
                  <Avatar name={session.user.fullName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">
                      {session.user.fullName}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">Platform console</span>
                  </span>
                </div>
                <p className="px-3 text-xs text-fg-subtle">Console</p>
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
                            'flex min-h-10 items-center gap-3 rounded-control border px-3 py-2 text-sm transition-colors',
                            active
                              ? 'border-border bg-surface font-medium text-fg shadow-[0_1px_2px_rgb(17_17_17_/_0.06)]'
                              : 'border-transparent text-fg-muted hover:bg-surface-sunken hover:text-fg',
                          )}
                        >
                          <Icon
                            aria-hidden
                            strokeWidth={1.75}
                            className="size-[1.125rem] shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.href === '/platform/messages' && unreadCount > 0 && (
                            <span
                              aria-label={`${unreadCount} unread`}
                              className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-fg"
                            >
                              {unreadCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="mt-auto border-t border-border pt-3">
                <p className="truncate px-2 text-xs text-fg-subtle">{session.user.email}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void logout()}
                  className="mt-2 w-full justify-start text-fg-muted hover:text-fg"
                >
                  <LogOut aria-hidden className="size-4" />
                  Sign out
                </Button>
              </div>
            </nav>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-border bg-surface">
              <div className="mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2 px-3 sm:px-6">
                <div className="min-w-0 flex-1" />
                <Button variant="ghost" iconOnly aria-label="Platform messages" asChild>
                  <Link href="/platform/messages" className="relative">
                    <MessageSquare aria-hidden strokeWidth={1.75} className="size-[1.125rem]" />
                    {unreadCount > 0 && (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger"
                      />
                    )}
                  </Link>
                </Button>
                <UserMenu />
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
                        {item.href === '/platform/messages' && unreadCount > 0 && (
                          <span
                            aria-label={`${unreadCount} unread`}
                            className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-fg"
                          >
                            {unreadCount}
                          </span>
                        )}
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
