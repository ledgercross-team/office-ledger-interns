'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { NotificationBell } from './notification-bell';
import { NavDrawerTrigger } from './sidebar';
import { UserMenu } from './user-menu';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

/**
 * Top bar (UI-SPEC §5): navigation controls, organisation context,
 * notification bell, and user menu.
 */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const { session } = useHrmsAuth();
  const router = useRouter();
  const segments = pathname.split('/').filter(Boolean);
  const parent = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '/';

  function goBack() {
    // A page opened directly (no history) falls back to its parent so Back never dead-ends.
    if (window.history.length > 1) router.back();
    else router.push(parent ?? '/');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-surface-raised">
      <div className="flex min-h-14 w-full items-center gap-1.5 px-3 sm:min-h-16 sm:gap-2 sm:px-7 lg:px-10">
        <NavDrawerTrigger onOpen={onOpenNav} />
        {pathname !== '/' && (
          <Button
            variant="ghost"
            iconOnly
            aria-label="Go back"
            onClick={goBack}
            className="lg:hidden"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {session?.org && (
            <div className="hidden max-w-52 items-center gap-2 rounded-control border border-border bg-surface-sunken/60 px-3 py-1.5 text-xs font-semibold text-fg-muted lg:flex">
              <Building2 aria-hidden className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{session.org.name}</span>
            </div>
          )}
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
