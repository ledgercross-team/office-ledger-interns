'use client';

import { useQuery } from '@tanstack/react-query';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { canDecideRequests } from '@/lib/hrms/role-ui';
import type { Paginated, ProjectInvite, RatingsDueProject, HrmsRequest } from '@/lib/hrms/types';

interface Mine {
  received: ProjectInvite[];
  toReview: ProjectInvite[];
}

export interface NavCounts {
  /** Requests waiting on this person's decision. */
  requests: number;
  /** Invites waiting on me plus declines waiting on my review. */
  invites: number;
  /** Projects with ratings due from me. */
  ratings: number;
  /** Unread messages plus unread report replies. */
  messages: number;
  isLoading: boolean;
}

function pendingInvites(mine: Mine | undefined): number {
  if (!mine) return 0;
  const waiting = (invite: ProjectInvite) =>
    invite.status === 'pending' || invite.status === 'declined';
  return (
    mine.received.filter(waiting).length +
    mine.toReview.filter((invite) => invite.status === 'declined').length
  );
}

/**
 * Badge counts for the shell nav. Each comes from an existing list endpoint
 * with a minimal page size; only the totals are used.
 */
export function useNavCounts(): NavCounts {
  const { session } = useHrmsAuth();
  const memberId = session?.activeMemberId ?? null;
  const role = session?.role ?? null;
  const orgMember = role === 'ceo' || role === 'coo' || role === 'manager' || role === 'employee';

  const requests = useQuery({
    queryKey: ['hrms', 'nav-counts', 'requests', memberId],
    queryFn: () => hrmsFetch<Paginated<HrmsRequest>>('/requests?scope=decide&pageSize=1'),
    enabled: canDecideRequests(role) && memberId !== null,
    staleTime: 60_000,
    retry: false,
  });

  const invites = useQuery({
    queryKey: ['hrms', 'nav-counts', 'invites', memberId],
    queryFn: () => hrmsFetch<Mine>('/me/invites'),
    enabled: orgMember && memberId !== null,
    staleTime: 60_000,
    retry: false,
  });

  const ratings = useQuery({
    queryKey: ['hrms', 'nav-counts', 'ratings', memberId],
    queryFn: () => hrmsFetch<{ items: RatingsDueProject[] }>('/me/ratings-due'),
    enabled: (role === 'manager' || role === 'employee') && memberId !== null,
    staleTime: 60_000,
    retry: false,
  });

  const messages = useQuery({
    queryKey: ['hrms', 'messages', 'unread', memberId],
    queryFn: () => hrmsFetch<{ messages: number; reports: number }>('/messages/unread-count'),
    enabled: orgMember && memberId !== null,
    staleTime: 5_000,
    retry: false,
  });

  return {
    messages: (messages.data?.messages ?? 0) + (messages.data?.reports ?? 0),
    requests: requests.data?.total ?? 0,
    invites: pendingInvites(invites.data),
    ratings: ratings.data?.items.length ?? 0,
    isLoading: requests.isLoading || invites.isLoading || ratings.isLoading,
  };
}
