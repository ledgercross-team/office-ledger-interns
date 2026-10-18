'use client';

import {
  CalendarCheck,
  CalendarDays,
  FolderKanban,
  Gauge,
  History,
  Home,
  Inbox,
  Mail,
  MessageSquare,
  Settings,
  SquareCheckBig,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { HrmsRole } from '@/lib/hrms/types';

export type NavBadgeKey = 'requests' | 'invites' | 'ratings' | 'messages';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: HrmsRole[];
  badge?: NavBadgeKey;
  bottomTab?: boolean;
  /** Shown indented under the item with this href (sidebar and drawer). */
  parent?: string;
}

/**
 * Role-based navigation (UI-SPEC §6). The server still enforces every route;
 * this only decides what each role sees. gameMasters never appear here:
 * they get the separate platform shell.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: Home,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    bottomTab: true,
  },
  {
    href: '/requests',
    label: 'Requests',
    icon: Inbox,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    badge: 'requests',
    bottomTab: true,
  },
  {
    href: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    bottomTab: true,
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: SquareCheckBig,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    bottomTab: true,
    parent: '/projects',
  },
  {
    href: '/messages',
    label: 'Messages',
    icon: MessageSquare,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    badge: 'messages',
  },
  {
    href: '/invites',
    label: 'Invites',
    icon: Mail,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    badge: 'invites',
  },
  { href: '/people', label: 'People', icon: Users, roles: ['ceo', 'coo', 'manager'] },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    roles: ['ceo', 'coo', 'manager', 'employee'],
  },
  {
    href: '/leave',
    label: 'Leave',
    icon: CalendarDays,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    bottomTab: true,
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    roles: ['ceo', 'coo', 'manager', 'employee'],
  },
  { href: '/workload', label: 'Workload', icon: Gauge, roles: ['ceo', 'coo', 'manager'] },
  {
    href: '/ratings',
    label: 'Ratings',
    icon: Star,
    roles: ['manager', 'employee'],
    badge: 'ratings',
  },
  {
    href: '/performance',
    label: 'Performance',
    icon: Star,
    roles: ['ceo', 'coo', 'manager', 'employee'],
  },
  { href: '/history', label: 'History', icon: History, roles: ['ceo', 'coo'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['ceo', 'coo'] },
];

/** The four most-used items per role for the mobile bottom tab bar. */
const BOTTOM_TABS: Record<string, string[]> = {
  ceo: ['/', '/requests', '/projects', '/tasks'],
  coo: ['/', '/requests', '/projects', '/tasks'],
  manager: ['/', '/tasks', '/requests', '/projects'],
  employee: ['/', '/tasks', '/leave', '/requests'],
};

export function navItemsFor(role: HrmsRole | null): NavItem[] {
  if (!role || role === 'gameMaster') return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function bottomTabsFor(role: HrmsRole | null): NavItem[] {
  if (!role || role === 'gameMaster') return [];
  const picks = BOTTOM_TABS[role] ?? BOTTOM_TABS.employee;
  return picks.flatMap((href) =>
    NAV_ITEMS.filter((item) => item.href === href && item.roles.includes(role)),
  );
}

/** Human-readable breadcrumb labels for shell top-bar crumbs. */
export const ROUTE_LABELS: Record<string, string> = {
  'accept-invite': 'Accept invite',
  attendance: 'Attendance',
  calendar: 'Calendar',
  'change-password': 'Change password',
  'forgot-password': 'Forgot password',
  history: 'History',
  invites: 'Invites',
  leave: 'Leave',
  login: 'Log in',
  messages: 'Messages',
  notifications: 'Notifications',
  people: 'People',
  performance: 'Performance',
  platform: 'Platform console',
  profile: 'Profile',
  projects: 'Projects',
  ratings: 'Ratings',
  requests: 'Requests',
  settings: 'Settings',
  tasks: 'Tasks',
  workload: 'Workload',
};
