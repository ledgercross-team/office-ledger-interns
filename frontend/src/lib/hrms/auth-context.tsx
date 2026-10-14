'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { hrmsFetch } from './api-client';
import type { HrmsMembership, HrmsSession } from './types';

export const HRMS_SESSION_KEY = ['hrms', 'session'] as const;

interface HrmsAuthValue {
  session: HrmsSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Memberships that can be signed into right now. */
  usableMemberships: HrmsMembership[];
  switchOrg: (memberId: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: HrmsSession) => void;
}

const HrmsAuthContext = createContext<HrmsAuthValue | null>(null);

export function HrmsAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const query = useQuery({
    queryKey: HRMS_SESSION_KEY,
    queryFn: () => hrmsFetch<HrmsSession>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const setSession = useCallback(
    (session: HrmsSession) => queryClient.setQueryData(HRMS_SESSION_KEY, session),
    [queryClient],
  );

  const switchOrg = useCallback(
    async (memberId: string) => {
      const session = await hrmsFetch<HrmsSession>('/auth/switch-org', {
        method: 'POST',
        body: { memberId },
      });
      // Everything cached belongs to the previous org.
      queryClient.clear();
      queryClient.setQueryData(HRMS_SESSION_KEY, session);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await hrmsFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } finally {
      queryClient.clear();
      router.push('/login');
    }
  }, [queryClient, router]);

  const value = useMemo<HrmsAuthValue>(() => {
    const session = query.data ?? null;
    return {
      session,
      isLoading: query.isLoading,
      isAuthenticated: session !== null,
      usableMemberships: session?.memberships.filter((m) => m.usable) ?? [],
      switchOrg,
      logout,
      setSession,
    };
  }, [query.data, query.isLoading, switchOrg, logout, setSession]);

  return <HrmsAuthContext.Provider value={value}>{children}</HrmsAuthContext.Provider>;
}

export function useHrmsAuth(): HrmsAuthValue {
  const context = useContext(HrmsAuthContext);
  if (!context) throw new Error('useHrmsAuth must be used within HrmsAuthProvider');
  return context;
}
