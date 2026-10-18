'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  cardClass,
  controlClass,
  labelClass,
  useToast,
} from '@/components/ui';
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
    <li className={`${cardClass} space-y-2`}>
      <p className="text-sm">
        <span className="font-medium text-fg">{invite.invitedBy.fullName}</span> invited you to{' '}
        <Link
          href={`/projects/${invite.project.id}`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {invite.project.name}
        </Link>
      </p>
      <p className="text-xs text-fg-muted">{STATUS_TEXT[invite.status]}</p>
      {invite.reviewReason && (
        <p className="text-sm text-fg">
          Reason from {invite.invitedBy.fullName}: &ldquo;{invite.reviewReason}&rdquo;
        </p>
      )}
      {invite.status === 'pending' && !declining && (
        <div className="flex gap-2">
          <Button loading={accept.isPending} onClick={() => accept.mutate()}>
            Accept
          </Button>
          <Button variant="secondary" onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
      {declining && (
        <div className="space-y-2">
          <label className={labelClass}>
            Why are you declining? (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={`${controlClass} min-h-24 resize-y`}
            />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={reason.trim().length === 0}
              loading={decline.isPending}
              onClick={() => decline.mutate()}
            >
              Send decline
            </Button>
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
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
    <li className={`${cardClass} space-y-2`}>
      <p className="text-sm">
        <span className="font-medium text-fg">{invite.invitee.fullName}</span> declined your invite
        to{' '}
        <Link
          href={`/projects/${invite.project.id}`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {invite.project.name}
        </Link>
      </p>
      <p className="text-sm text-fg">&ldquo;{invite.declineReason}&rdquo;</p>
      {!overruling && (
        <div className="flex gap-2">
          <Button loading={review.isPending} onClick={() => review.mutate({ decision: 'accept' })}>
            Accept the decline
          </Button>
          <Button variant="secondary" onClick={() => setOverruling(true)}>
            Overrule
          </Button>
        </div>
      )}
      {overruling && (
        <div className="space-y-2">
          <label className={labelClass}>
            Reason for overruling (they will see it)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={`${controlClass} min-h-24 resize-y`}
            />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={reason.trim().length === 0}
              loading={review.isPending}
              onClick={() => review.mutate({ decision: 'overrule', reason: reason.trim() })}
            >
              Overrule and add to the project
            </Button>
            <Button variant="secondary" onClick={() => setOverruling(false)}>
              Cancel
            </Button>
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {session?.role === 'employee' ? 'My invites' : 'Invite reviews'}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {session?.role === 'employee'
            ? 'Accept or decline invitations to join projects.'
            : 'Review declined invitations and keep project membership moving.'}
        </p>
      </div>
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
          <h2 className="font-semibold text-fg">Declines waiting for your review</h2>
          <ul className="space-y-3">
            {toReview.map((i) => (
              <ReviewItem key={i.id} invite={i} onDone={done} />
            ))}
          </ul>
        </section>
      )}

      {session?.role !== 'ceo' && session?.role !== 'coo' && (
        <section className="space-y-2">
          <h2 className="font-semibold text-fg">Invites to you</h2>
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
