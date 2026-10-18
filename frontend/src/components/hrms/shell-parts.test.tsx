import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/lib/hrms/auth-context', () => ({
  useHrmsAuth: vi.fn(),
}));

vi.mock('@/lib/hrms/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hrms/api-client')>();
  return { ...original, hrmsFetch: vi.fn() };
});

import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { bottomTabsFor, navItemsFor } from '@/components/hrms/app-nav';
import { OrgBanners } from '@/components/hrms/org-banners';
import { OrgPicker } from '@/components/hrms/org-picker';
import { PasswordStrengthMeter, passwordStrength } from '@/components/hrms/password-strength';
import type { HrmsSession } from '@/lib/hrms/types';

const mockedAuth = vi.mocked(useHrmsAuth);
const mockedFetch = vi.mocked(hrmsFetch);

function session(overrides: Partial<HrmsSession> = {}): HrmsSession {
  return {
    user: {
      id: 'u1',
      email: 'aisha@demo.local',
      fullName: 'Aisha Chowdhury',
      timezone: 'UTC',
      mfaEnabled: false,
    },
    isGameMaster: false,
    memberships: [],
    activeMemberId: 'm1',
    role: 'ceo',
    org: { id: 'o1', name: 'Acme Demo', status: 'active' },
    needsOrgSelection: false,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockAuth(value: Partial<ReturnType<typeof useHrmsAuth>>) {
  mockedAuth.mockReturnValue({
    session: null,
    isLoading: false,
    isAuthenticated: false,
    usableMemberships: [],
    switchOrg: vi.fn(),
    logout: vi.fn(),
    setSession: vi.fn(),
    ...value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetch.mockRejectedValue(new Error('no fetch in this test'));
  window.localStorage.clear();
});

describe('role navigation', () => {
  it('shows only the items each role may use', () => {
    expect(navItemsFor('employee').map((i) => i.href)).toEqual([
      '/',
      '/requests',
      '/projects',
      '/tasks',
      '/messages',
      '/invites',
      '/attendance',
      '/leave',
      '/calendar',
      '/ratings',
      '/performance',
    ]);
    expect(navItemsFor('manager').map((i) => i.href)).toContain('/people');
    expect(navItemsFor('manager').map((i) => i.href)).toContain('/ratings');
    expect(navItemsFor('ceo').map((i) => i.href)).toEqual(
      expect.arrayContaining(['/performance', '/history', '/settings', '/workload']),
    );
    expect(navItemsFor('employee').map((i) => i.href)).not.toContain('/settings');
    expect(navItemsFor('gameMaster')).toEqual([]);
  });

  it('gives each role four bottom tabs', () => {
    expect(bottomTabsFor('ceo').map((i) => i.href)).toEqual([
      '/',
      '/requests',
      '/projects',
      '/tasks',
    ]);
    expect(bottomTabsFor('employee').map((i) => i.href)).toEqual([
      '/',
      '/tasks',
      '/leave',
      '/requests',
    ]);
  });
});

describe('org banners', () => {
  it('warns in read-only mode', () => {
    mockAuth({
      session: session({ org: { id: 'o1', name: 'Acme', status: 'read_only' } }),
      isAuthenticated: true,
    });
    render(<OrgBanners />, { wrapper });
    expect(screen.getByText(/read-only until the subscription is renewed/)).toBeVisible();
  });

  it('warns CEOs about seat usage', async () => {
    mockAuth({ session: session(), isAuthenticated: true });
    mockedFetch.mockResolvedValue({
      id: 'o1',
      seats: { seatLimit: 10, seatsUsed: 10, percentUsed: 100, warningLevel: 100 },
    });
    render(<OrgBanners />, { wrapper });
    expect(await screen.findByText('All seats are in use.')).toBeVisible();
  });
});

describe('org picker', () => {
  const memberships: HrmsSession['memberships'] = [
    {
      memberId: 'm1',
      orgId: 'o1',
      orgName: 'Acme Demo',
      orgStatus: 'active',
      role: 'manager',
      status: 'active',
      usable: true,
    },
    {
      memberId: 'm2',
      orgId: 'o2',
      orgName: 'Globex Demo',
      orgStatus: 'active',
      role: 'employee',
      status: 'active',
      usable: true,
    },
  ];

  it('lists usable orgs with roles and picks one', async () => {
    const user = userEvent.setup();
    const switchOrg = vi.fn().mockResolvedValue(undefined);
    mockAuth({
      session: session({ memberships, needsOrgSelection: true }),
      usableMemberships: memberships,
      switchOrg,
      isAuthenticated: true,
    });
    render(<OrgPicker />, { wrapper });
    expect(screen.getByText('Acme Demo')).toBeVisible();
    expect(screen.getByText('Globex Demo')).toBeVisible();
    await user.click(
      within(screen.getByText('Globex Demo').closest('li')!).getByRole('button', {
        name: 'Continue',
      }),
    );
    expect(switchOrg).toHaveBeenCalledWith('m2');
  });

  it('explains when nothing is usable', () => {
    mockAuth({
      session: session({ memberships: [] }),
      usableMemberships: [],
      isAuthenticated: true,
    });
    render(<OrgPicker />, { wrapper });
    expect(screen.getByText('No organisation available')).toBeVisible();
  });
});

describe('password strength', () => {
  it('grades by length only, like the API', () => {
    expect(passwordStrength('short')).toBe('too-short');
    expect(passwordStrength('tenchars!!')).toBe('weak');
    expect(passwordStrength('fifteen-chars!!')).toBe('fair');
    expect(passwordStrength('twenty-characters-long!!')).toBe('strong');
  });

  it('announces the meter value', () => {
    render(<PasswordStrengthMeter password="twenty-characters-long!!" />);
    expect(screen.getByRole('meter', { name: 'Password strength' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
  });
});
