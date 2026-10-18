'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { hrmsFetch } from './api-client';
import { setDisplayTimeZone } from '@/lib/hrms/time';
import type { HrmsMembership, HrmsSession } from './types';

export const HRMS_SESSION_KEY = ['hrms', 'session'] as const;

const PUBLIC_AUTH_PATHS = new Set(['/login', '/accept-invite', '/forgot-password']);

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
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAuthPath = pathname !== null && PUBLIC_AUTH_PATHS.has(pathname);

  const query = useQuery({
    queryKey: HRMS_SESSION_KEY,
    queryFn: () => hrmsFetch<HrmsSession>('/auth/me'),
    enabled: !isPublicAuthPath,
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
      // Publish the new session first so observers never see a gap, then
      // drop everything cached for the previous org.
      queryClient.setQueryData(HRMS_SESSION_KEY, session);
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'hrms' && query.queryKey[1] !== 'session',
      });
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
    setDisplayTimeZone(session?.user.timezone);
    return {
      session,
      isLoading: !isPublicAuthPath && query.isLoading,
      isAuthenticated: session !== null,
      usableMemberships: session?.memberships.filter((m) => m.usable) ?? [],
      switchOrg,
      logout,
      setSession,
    };
  }, [isPublicAuthPath, query.data, query.isLoading, switchOrg, logout, setSession]);

  return <HrmsAuthContext.Provider value={value}>{children}</HrmsAuthContext.Provider>;
}

export function useHrmsAuth(): HrmsAuthValue {
  const context = useContext(HrmsAuthContext);
  if (!context) throw new Error('useHrmsAuth must be used within HrmsAuthProvider');
  return context;
}
