'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Drawer } from '@/components/ui';
import { BrandMark } from './brand';
import { bottomTabsFor, navItemsFor, navLabelFor, type NavItem } from './app-nav';
import type { NavCounts } from './use-nav-counts';
import type { HrmsRole } from '@/lib/hrms/types';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} waiting`}
      className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary-fg"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

const NAV_GROUPS = [
  {
    label: 'Workspace',
    hrefs: ['/', '/requests', '/projects', '/tasks', '/messages'],
  },
  {
    label: 'People & time',
    hrefs: [
      '/invites',
      '/people',
      '/attendance',
      '/leave',
      '/calendar',
      '/workload',
      '/ratings',
      '/performance',
    ],
  },
  {
    label: 'Administration',
    hrefs: ['/history', '/settings'],
  },
] as const;

function NavList({
  items,
  counts,
  role,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  counts: NavCounts;
  role: HrmsRole;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.hrefs.some((href) => href === item.href)),
  })).filter((group) => group.items.length > 0);

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <li
        key={item.href}
        className={cn(item.parent && !collapsed && 'ml-5 border-l border-rail-fg/25 pl-2')}
      >
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
          title={collapsed ? navLabelFor(item, role) : undefined}
          className={cn(
            'group flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150',
            active
              ? 'bg-surface text-fg font-bold shadow-sm'
              : 'text-rail-fg/78 hover:translate-x-px hover:bg-white/10 hover:text-rail-fg',
            collapsed && 'justify-center px-2',
          )}
        >
          <Icon aria-hidden className="size-5 shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{navLabelFor(item, role)}</span>}
          {!collapsed && item.badge && <CountBadge count={counts[item.badge]} />}
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-rail-fg/45">
              {group.label}
            </p>
          )}
          <ul className="space-y-1">{group.items.map(renderItem)}</ul>
        </section>
      ))}
    </div>
  );
}

export function Sidebar({
  role,
  orgName,
  counts,
  collapsed,
  onToggleCollapse,
}: {
  role: HrmsRole;
  orgName: string;
  counts: NavCounts;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className={cn(
        'hidden h-full min-h-0 flex-col gap-5 overflow-hidden rounded-card border border-white/10 bg-rail p-3 text-rail-fg shadow-[0_18px_45px_rgb(15_41_49_/_0.16)] lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-2 px-2 py-1', collapsed && 'justify-center')}>
        <BrandMark />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[-0.01em] text-rail-fg">
              Office Ledger
            </span>
            <span className="mt-0.5 block truncate text-[0.7rem] text-rail-fg/55">
              {orgName || 'Workspace'}
            </span>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto slim-scroll">
        <NavList
          items={navItemsFor(role)}
          counts={counts}
          role={role}
          pathname={pathname}
          collapsed={collapsed}
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        iconOnly={collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={onToggleCollapse}
        className={cn(
          'border-white/10 bg-white/5 text-rail-fg hover:bg-white/10 hover:text-rail-fg',
          collapsed && 'mx-auto',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="size-4" />
        ) : (
          <>
            <PanelLeftClose aria-hidden className="size-4" />
            Collapse
          </>
        )}
      </Button>
    </nav>
  );
}

/** Below lg the sidebar becomes a drawer opened from the top bar. */
export function NavDrawer({
  role,
  orgName,
  counts,
  open,
  onOpenChange,
}: {
  role: HrmsRole;
  orgName: string;
  counts: NavCounts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  return (
    <Drawer
      side="left"
      open={open}
      onOpenChange={onOpenChange}
      title={orgName}
      description="Main navigation"
    >
      <nav aria-label="Main" className="rounded-card bg-rail p-3 text-rail-fg">
        <NavList
          items={navItemsFor(role)}
          counts={counts}
          role={role}
          pathname={pathname}
          collapsed={false}
          onNavigate={() => onOpenChange(false)}
        />
      </nav>
    </Drawer>
  );
}

export function NavDrawerTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      iconOnly
      aria-label="Open navigation"
      onClick={onOpen}
      className="lg:hidden"
    >
      <Menu aria-hidden className="size-5" />
    </Button>
  );
}

/** Mobile bottom tab bar with the 4 most-used items for the role. */
export function BottomTabs({ role, counts }: { role: HrmsRole; counts: NavCounts }) {
  const pathname = usePathname();
  const items = bottomTabsFor(role);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(15_41_49_/_0.08)] lg:hidden"
    >
      <ul
        className="mx-auto grid max-w-xl px-1 pt-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 text-xs font-medium transition-colors active:bg-surface-sunken',
                  active ? 'bg-primary-soft text-primary' : 'text-fg-muted',
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="max-w-full truncate">{navLabelFor(item, role)}</span>
                {item.badge && counts[item.badge] > 0 && (
                  <span
                    aria-label={`${counts[item.badge]} waiting`}
                    className="absolute right-1/2 top-1 translate-x-5 rounded-full bg-primary px-1 text-xs tabular-nums text-primary-fg"
                  >
                    {counts[item.badge] > 99 ? '99+' : counts[item.badge]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
