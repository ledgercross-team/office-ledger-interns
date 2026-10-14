'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, ErrorState, ReadOnlyProvider, Skeleton, ToastProvider } from '@/components/ui';
import { NavDrawer, BottomTabs, Sidebar } from '@/components/hrms/sidebar';
import { FullPageState } from '@/components/hrms/full-page-state';
import { OrgBanners } from '@/components/hrms/org-banners';
import { OrgPicker } from '@/components/hrms/org-picker';
import { Topbar } from '@/components/hrms/topbar';
import { useNavCounts } from '@/components/hrms/use-nav-counts';
import { useReadOnly } from '@/components/hrms/read-only';
import { useHrmsAuth } from '@/lib/hrms/auth-context';

const COLLAPSE_KEY = 'ol-sidebar-collapsed';

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-hidden>
      <div className="hidden w-60 space-y-2 border-r border-border p-4 lg:block">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function SignOutAction() {
  const { logout } = useHrmsAuth();
  return (
    <Button variant="secondary" onClick={() => void logout()}>
      Sign out
    </Button>
  );
}

function OrgGate({ children }: { children: ReactNode }) {
  const { session } = useHrmsAuth();
  const status = session?.org?.status;
  const role = session?.role;

  // No org yet (multi-org login that hasn't picked one): picker, not content.
  if (session && !session.isGameMaster && session.org === null) {
    return (
      <main className="mx-auto w-full max-w-[768px] flex-1 p-4 sm:p-6">
        <OrgPicker />
      </main>
    );
  }

  if (status === 'blocked') return <FullPageState kind="blocked" actions={<SignOutAction />} />;

  if (status === 'suspended' && role !== 'ceo' && role !== 'coo') {
    return <FullPageState kind="suspended" actions={<SignOutAction />} />;
  }

  return <>{children}</>;
}

export function HrmsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, isLoading } = useHrmsAuth();
  const counts = useNavCounts();
  const { reason: readOnlyReason } = useReadOnly();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isLoading || !session) {
      if (!isLoading) router.replace('/login');
      return;
    }
    if (session.user.mustChangePassword) router.replace('/change-password');
    else if (session.isGameMaster) router.replace('/platform');
  }, [isLoading, session, router]);

  function toggleCollapse() {
    setCollapsed((next) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '0' : '1');
      } catch {
        // Ignore storage failures.
      }
      return !next;
    });
  }

  if (isLoading || !session) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <a href="#main-content" className="sr-only">
          Skip to content
        </a>
        <ShellSkeleton />
      </div>
    );
  }

  // gameMaster never sees org pages; the platform shell takes over.
  if (session.isGameMaster) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <a href="#main-content" className="sr-only">
          Skip to content
        </a>
        <ShellSkeleton />
      </div>
    );
  }

  const role = session.role;
  if (!role) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <a href="#main-content" className="sr-only">
          Skip to content
        </a>
        <main id="main-content" className="mx-auto w-full max-w-[768px] flex-1 p-4 sm:p-6">
          <ErrorState title="No active organisation" message="Pick an organisation to continue." />
          <div className="mt-4">
            <OrgPicker />
          </div>
        </main>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ReadOnlyProvider value={readOnlyReason}>
        <div className="min-h-screen bg-bg text-fg">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
          >
            Skip to content
          </a>
          <div className="flex min-h-screen">
            <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface p-3 lg:block">
              <Sidebar
                role={role}
                orgName={session.org?.name ?? ''}
                counts={counts}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
              />
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar onOpenNav={() => setNavOpen(true)} />
              <OrgGate>
                <main
                  id="main-content"
                  className="mx-auto w-full max-w-[1280px] flex-1 space-y-6 p-4 pb-24 sm:p-6 lg:pb-6"
                >
                  <OrgBanners />
                  {children}
                </main>
              </OrgGate>
              <BottomTabs role={role} counts={counts} />
            </div>
          </div>
          <NavDrawer
            role={role}
            orgName={session.org?.name ?? ''}
            counts={counts}
            open={navOpen}
            onOpenChange={setNavOpen}
          />
        </div>
      </ReadOnlyProvider>
    </ToastProvider>
  );
}
