'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Banner, EmptyState, ErrorState, Skeleton, useToast } from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { InviteStatus, ProjectInvite } from '@/lib/hrms/types';

interface Mine {
  received: ProjectInvite[];
  toReview: ProjectInvite[];
}

const STATUS_TEXT: Record<InviteStatus, string> = {
  pending: 'Waiting for your answer',
  accepted: 'You joined the project',
  declined: 'You declined. The sender will review it.',
  decline_accepted: 'Your decline was accepted',
  overruled: 'Your decline was overruled. You are on the project.',
  expired: 'Expired',
};

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary =
  'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function ReceivedItem({ invite, onDone }: { invite: ProjectInvite; onDone: () => void }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () => hrmsFetch(`/invites/${invite.id}/accept`, { method: 'POST' }),
    onSuccess: onDone,
    onError: (err) => setError(message(err)),
  });
  const decline = useMutation({
    mutationFn: () =>
      hrmsFetch(`/invites/${invite.id}/decline`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      setDeclining(false);
      onDone();
    },
    onError: (err) => setError(message(err)),
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
      <p className="text-sm">
        <span className="font-medium text-charcoal">{invite.invitedBy.fullName}</span> invited you
        to{' '}
        <Link
          href={`/projects/${invite.project.id}`}
          className="font-medium text-forest hover:underline"
        >
          {invite.project.name}
        </Link>
      </p>
      <p className="text-xs text-charcoal-soft">{STATUS_TEXT[invite.status]}</p>
      {invite.reviewReason && (
        <p className="text-sm text-charcoal">
          Reason from {invite.invitedBy.fullName}: &ldquo;{invite.reviewReason}&rdquo;
        </p>
      )}
      {invite.status === 'pending' && !declining && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
            className={primary}
          >
            Accept
          </button>
          <button type="button" onClick={() => setDeclining(true)} className={secondary}>
            Decline
          </button>
        </div>
      )}
      {declining && (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm text-charcoal">
            Why are you declining? (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={input}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0 || decline.isPending}
              onClick={() => decline.mutate()}
              className={primary}
            >
              Send decline
            </button>
            <button type="button" onClick={() => setDeclining(false)} className={secondary}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <Banner tone="danger" title="Invite action failed">
          {error}
        </Banner>
      )}
    </li>
  );
}

function ReviewItem({ invite, onDone }: { invite: ProjectInvite; onDone: () => void }) {
  const [overruling, setOverruling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const review = useMutation({
    mutationFn: (body: { decision: 'accept' | 'overrule'; reason?: string }) =>
      hrmsFetch(`/invites/${invite.id}/review`, { method: 'POST', body }),
    onSuccess: () => {
      setOverruling(false);
      onDone();
    },
    onError: (err) => setError(message(err)),
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
      <p className="text-sm">
        <span className="font-medium text-charcoal">{invite.invitee.fullName}</span> declined your
        invite to{' '}
        <Link
          href={`/projects/${invite.project.id}`}
          className="font-medium text-forest hover:underline"
        >
          {invite.project.name}
        </Link>
      </p>
      <p className="text-sm text-charcoal">&ldquo;{invite.declineReason}&rdquo;</p>
      {!overruling && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={review.isPending}
            onClick={() => review.mutate({ decision: 'accept' })}
            className={primary}
          >
            Accept the decline
          </button>
          <button type="button" onClick={() => setOverruling(true)} className={secondary}>
            Overrule
          </button>
        </div>
      )}
      {overruling && (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm text-charcoal">
            Reason for overruling (they will see it)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={input}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0 || review.isPending}
              onClick={() => review.mutate({ decision: 'overrule', reason: reason.trim() })}
              className={primary}
            >
              Overrule and add to the project
            </button>
            <button type="button" onClick={() => setOverruling(false)} className={secondary}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <Banner tone="danger" title="Invite review failed">
          {error}
        </Banner>
      )}
    </li>
  );
}

export default function InvitesPage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const invites = useQuery({
    queryKey: ['hrms', 'invites', session?.activeMemberId],
    queryFn: () => hrmsFetch<Mine>('/me/invites'),
    enabled: Boolean(session?.activeMemberId),
  });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'invites'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'projects'] });
    toast({
      title: 'Invite updated',
      description: 'The latest invite status is now visible.',
      tone: 'success',
    });
  };

  const received = invites.data?.received ?? [];
  const toReview = invites.data?.toReview ?? [];

  return (
    <>
      <h1 className="text-xl font-semibold text-charcoal">Invites</h1>
      {invites.isLoading && (
        <div className="space-y-3" aria-label="Loading invites">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      )}
      {invites.error && (
        <ErrorState
          title="Could not load invites"
          message={message(invites.error)}
          onRetry={() => void invites.refetch()}
        />
      )}

      {toReview.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-charcoal">Declines waiting for your review</h2>
          <ul className="space-y-3">
            {toReview.map((i) => (
              <ReviewItem key={i.id} invite={i} onDone={done} />
            ))}
          </ul>
        </section>
      )}

      {session?.role !== 'ceo' && session?.role !== 'coo' && (
        <section className="space-y-2">
          <h2 className="font-medium text-charcoal">Invites to you</h2>
          {invites.data && received.length === 0 && (
            <EmptyState
              title="No invites"
              description="Project invitations will appear here when someone adds you to a project."
            />
          )}
          <ul className="space-y-3">
            {received.map((i) => (
              <ReceivedItem key={i.id} invite={i} onDone={done} />
            ))}
          </ul>
        </section>
      )}

      {invites.data &&
        toReview.length === 0 &&
        (session?.role === 'ceo' || session?.role === 'coo') && (
          <EmptyState
            title="Nothing to review"
            description="Declined invitations needing your decision will appear here."
          />
        )}
    </>
  );
}
