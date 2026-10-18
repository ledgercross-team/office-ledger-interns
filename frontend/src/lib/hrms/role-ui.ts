import type { HrmsRole } from './types';

export const ROLE_UI = {
  ceo: {
    label: 'CEO',
    dashboardDescription: 'Lead the organisation through people, approvals, and project decisions.',
    workHeading: 'Organisation priorities',
    workDescription: 'Items that need your attention across the organisation.',
  },
  coo: {
    label: 'COO',
    dashboardDescription:
      'Keep operations moving through approvals, attendance, and team capacity.',
    workHeading: 'Operations priorities',
    workDescription: 'Items that need your attention across daily operations.',
  },
  manager: {
    label: 'Manager',
    dashboardDescription: 'Coordinate your team’s tasks, attendance, projects, and approvals.',
    workHeading: 'Team priorities',
    workDescription: 'Items waiting for you from your team and projects.',
  },
  employee: {
    label: 'Employee',
    dashboardDescription: 'Keep track of your workday, tasks, leave, and project commitments.',
    workHeading: 'Your work',
    workDescription: 'Items waiting for you today.',
  },
  gameMaster: {
    label: 'Game master',
    dashboardDescription: 'Manage organisations and platform access.',
    workHeading: 'Platform priorities',
    workDescription: 'Items waiting for you in the platform console.',
  },
} satisfies Record<
  HrmsRole,
  {
    label: string;
    dashboardDescription: string;
    workHeading: string;
    workDescription: string;
  }
>;

export function isLeadershipRole(role: HrmsRole | null | undefined): role is 'ceo' | 'coo' {
  return role === 'ceo' || role === 'coo';
}

export function canDecideRequests(role: HrmsRole | null | undefined): boolean {
  return role === 'ceo' || role === 'coo' || role === 'manager';
}
