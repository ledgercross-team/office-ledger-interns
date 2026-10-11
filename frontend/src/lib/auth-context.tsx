'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { apiFetch, fetchAuthSession } from './api-client';
import type { AuthUser } from './types';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchAuthSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } finally {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
      router.push('/login');
    }
  }, [queryClient, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: query.data?.user ?? null,
      isLoading: query.isLoading,
      isAuthenticated: Boolean(query.data?.user),
      error: (query.error as Error | null) ?? null,
      refresh: query.refetch,
      logout,
    }),
    [query.data, query.isLoading, query.error, query.refetch, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
