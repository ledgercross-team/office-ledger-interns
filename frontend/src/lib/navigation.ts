import type { Role } from './types';

export interface NavItem {
  href: string;
  label: string;
}

// Role -> pages map, matching section 15.1.
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  game_master: [{ href: '/game-master', label: 'Companies' }],
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/team-attendance', label: 'Team attendance' },
    { href: '/people', label: 'People' },
    { href: '/subscription', label: 'Subscription' },
    { href: '/messages', label: 'Messages' },
  ],
  manager: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/attendance', label: 'Attendance' },
    { href: '/team-attendance', label: 'Team attendance' },
    { href: '/people', label: 'People' },
  ],
  employee: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/attendance', label: 'Attendance' },
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  game_master: 'Game master',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
};

export function homePath(role: Role): string {
  return role === 'game_master' ? '/game-master' : '/dashboard';
}

// Only same-site absolute paths are accepted: starts with "/" but not "//" or "/\".
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}
