'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Search } from 'lucide-react';
import { Breadcrumbs, Button, CommandPalette, type CommandItem } from '@/components/ui';
import { ROUTE_LABELS, navItemsFor, navLabelFor } from './app-nav';
import { NotificationBell } from './notification-bell';
import { QuickCheckIn } from './quick-check-in';
import { NavDrawerTrigger } from './sidebar';
import { UserMenu } from './user-menu';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsMember, HrmsProject, HrmsTask, Paginated, HrmsRole } from '@/lib/hrms/types';

function crumbs(pathname: string): Array<{ label: string; href?: string }> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'Dashboard' }];
  const items: Array<{ label: string; href?: string }> = [];
  let href = '';
  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const last = index === segments.length - 1;
    const label = ROUTE_LABELS[segment] ?? (last ? 'Details' : segment);
    items.push(last ? { label } : { label, href });
  });
  return items;
}

function usePaletteItems(role: HrmsRole | null): CommandItem[] {
  const { session } = useHrmsAuth();
  const router = useRouter();
  const enabled = session?.activeMemberId != null;

  const people = useQuery({
    queryKey: ['hrms', 'palette', 'people', session?.activeMemberId],
    queryFn: () => hrmsFetch<Paginated<HrmsMember>>('/members?status=active&pageSize=25'),
    // Employees may not list people; asking would only produce a 403.
    enabled: enabled && (role === 'ceo' || role === 'coo' || role === 'manager'),
    staleTime: 60_000,
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['hrms', 'palette', 'projects', session?.activeMemberId],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>('/projects?status=active&pageSize=25'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  const tasks = useQuery({
    queryKey: ['hrms', 'palette', 'tasks', session?.activeMemberId],
    queryFn: () => hrmsFetch<Paginated<HrmsTask>>('/tasks?open=true&pageSize=25'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const go = (href: string) => () => router.push(href);
  return [
    ...navItemsFor(role).map((item) => ({
      id: `page-${item.href}`,
      label: navLabelFor(item, role),
      group: 'Pages',
      icon: <item.icon aria-hidden className="size-4" />,
      onSelect: go(item.href),
    })),
    ...(people.data?.items ?? []).map((person) => ({
      id: `person-${person.id}`,
      label: person.fullName,
      group: 'People',
      keywords: person.email,
      onSelect: go(`/people/${person.id}`),
    })),
    ...(projects.data?.items ?? []).map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      group: 'Projects',
      onSelect: go(`/projects/${project.id}`),
    })),
    ...(tasks.data?.items ?? []).map((task) => ({
      id: `task-${task.id}`,
      label: task.title,
      group: 'Tasks',
      keywords: task.projectName,
      onSelect: go(`/tasks/${task.id}`),
    })),
  ];
}

/**
 * Top bar (UI-SPEC §5): breadcrumbs, command palette, quick check-in,
 * notification bell, user menu.
 */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const { session } = useHrmsAuth();
  const router = useRouter();
  const paletteItems = usePaletteItems(session?.role ?? null);
  const trail = crumbs(pathname);
  const parent = trail.length > 1 ? trail[trail.length - 2].href : '/';

  function goBack() {
    // A page opened directly (no history) falls back to its parent so Back never dead-ends.
    if (window.history.length > 1) router.back();
    else router.push(parent ?? '/');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur-sm">
      <div className="flex min-h-14 w-full items-center gap-2 px-3 sm:min-h-16 sm:px-7 lg:px-10">
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
        <CommandPalette
          items={paletteItems}
          trigger={
            <button
              type="button"
              aria-label="Search pages, people, projects and tasks"
              className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-left text-sm text-fg-subtle transition-colors hover:border-border-strong sm:max-w-md"
            >
              <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Search pages, people, projects…</span>
              <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[0.7rem] font-medium text-fg-muted md:inline">
                ⌘K
              </kbd>
            </button>
          }
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {session?.org && (
            <div className="hidden max-w-52 items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted xl:flex">
              <Building2 aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
              <span className="truncate">{session.org.name}</span>
            </div>
          )}
          <QuickCheckIn />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      {trail.length > 1 && (
        <div className="hidden px-3 pb-2 sm:px-7 md:block lg:px-10">
          <Breadcrumbs items={trail} />
        </div>
      )}
    </header>
  );
}
