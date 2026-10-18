'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { Breadcrumbs, Button, CommandPalette, type CommandItem } from '@/components/ui';
import { ROUTE_LABELS, navItemsFor } from './app-nav';
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
      label: item.label,
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
    <header className="sticky top-0 z-20 border-b border-border bg-surface-raised">
      <div className="flex min-h-16 w-full items-center gap-2 px-3 sm:px-6 lg:px-8">
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
        <div className="hidden min-w-0 flex-1 md:block">
          <Breadcrumbs items={crumbs(pathname)} />
        </div>
        <div className="min-w-0 flex-1 md:hidden">
          <p className="truncate text-sm font-semibold text-fg">
            {crumbs(pathname)
              .map((c) => c.label)
              .join(' / ')}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <CommandPalette
            items={paletteItems}
            trigger={
              <Button
                variant="secondary"
                iconOnly
                aria-label="Search pages, people, projects and tasks"
              >
                <Search aria-hidden className="size-4" />
              </Button>
            }
          />
          <QuickCheckIn />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
