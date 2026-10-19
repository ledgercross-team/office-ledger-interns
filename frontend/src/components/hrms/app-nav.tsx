'use client';

import {
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
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
  labels?: Partial<Record<HrmsRole, string>>;
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
    labels: { employee: 'My requests', manager: 'Approvals', ceo: 'Approvals', coo: 'Approvals' },
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
    labels: { employee: 'My tasks', manager: 'Team tasks' },
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
    labels: {
      employee: 'My invites',
      manager: 'Invite reviews',
      ceo: 'Invite reviews',
      coo: 'Invite reviews',
    },
    icon: Mail,
    roles: ['ceo', 'coo', 'manager', 'employee'],
    badge: 'invites',
  },
  { href: '/people', label: 'People', icon: Users, roles: ['ceo', 'coo', 'manager'] },
  {
    href: '/attendance',
    label: 'Attendance',
    labels: { employee: 'My attendance' },
    icon: CalendarCheck,
    roles: ['ceo', 'coo', 'manager', 'employee'],
  },
  {
    href: '/leave',
    label: 'Leave',
    labels: {
      employee: 'My leave',
      manager: 'Leave approvals',
      ceo: 'Leave approvals',
      coo: 'Leave & approvals',
    },
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
    labels: { manager: 'Rate projects', employee: 'Rate projects' },
    icon: Star,
    roles: ['manager', 'employee'],
    badge: 'ratings',
  },
  {
    href: '/performance',
    label: 'Performance',
    labels: {
      ceo: 'Team performance',
      coo: 'Team performance',
      manager: 'My performance',
      employee: 'My performance',
    },
    icon: ChartNoAxesCombined,
    roles: ['ceo', 'coo', 'manager', 'employee'],
  },
  {
    href: '/history',
    label: 'History',
    labels: { ceo: 'Audit history', coo: 'Audit history' },
    icon: History,
    roles: ['ceo', 'coo'],
  },
  {
    href: '/settings',
    label: 'Settings',
    labels: { ceo: 'Organisation settings', coo: 'Organisation settings' },
    icon: Settings,
    roles: ['ceo', 'coo'],
  },
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

export function navLabelFor(item: NavItem, role: HrmsRole | null): string {
  return (role && item.labels?.[role]) ?? item.label;
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
