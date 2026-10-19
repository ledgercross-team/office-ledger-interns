'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageShell,
  SectionHeading,
  Skeleton,
  useToast,
} from '@/components/ui';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsLeave, LeaveBalance, RequestStatus } from '@/lib/hrms/types';

const input =
  'min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary';
const STATUS_CHIP: Record<RequestStatus, string> = {
  pending: 'bg-warning-soft text-warning-fg',
  approved: 'bg-success-soft text-success-fg',
  applied: 'bg-success-soft text-success-fg',
  rejected: 'bg-danger-soft text-danger-fg',
  cancelled: 'bg-surface-sunken text-fg-muted',
  expired: 'bg-surface-sunken text-fg-muted',
};
const actionRow = 'flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto';

const STATUS: Record<RequestStatus, string> = {
  pending: 'Waiting for a decision',
  approved: 'Approved',
  applied: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

function message(error: unknown): string {
  return error instanceof HrmsApiError ? error.message : 'Something went wrong. Please try again.';
}

function span(l: HrmsLeave): string {
  const same = l.startDate === l.endDate;
  const half = (b: boolean) => (b ? ' (half day)' : '');
  return same
    ? `${l.startDate}${half(l.startHalfDay || l.endHalfDay)}`
    : `${l.startDate}${half(l.startHalfDay)} to ${l.endDate}${half(l.endHalfDay)}`;
}

function LeaveItem({
  leave,
  showPerson,
  onChanged,
}: {
  leave: HrmsLeave;
  showPerson: boolean;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const settle = {
    onSuccess: () => {
      setRejecting(false);
      onChanged();
    },
    onError: (err: unknown) => setError(message(err)),
  };
  const approve = useMutation({
    mutationFn: () => hrmsFetch(`/requests/${leave.requestId}/approve`, { method: 'POST' }),
    ...settle,
  });
  const reject = useMutation({
    mutationFn: () =>
      hrmsFetch(`/requests/${leave.requestId}/reject`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    ...settle,
  });
  const cancel = useMutation({
    mutationFn: () => hrmsFetch(`/leave/${leave.requestId}/cancel`, { method: 'POST' }),
    ...settle,
  });

  return (
    <li className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm font-medium text-fg">
          {showPerson && <span>{leave.member.fullName} · </span>}
          {leave.leaveType.name}
        </p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CHIP[leave.status]}`}
        >
          {STATUS[leave.status]}
        </span>
      </div>
      <p className="text-sm text-fg-muted">
        {span(leave)} · {leave.days} working {leave.days === 1 ? 'day' : 'days'}
        {leave.decidedBy ? ` · by ${leave.decidedBy}` : ''}
        {leave.overAllowance ? ' · over the allowance, the extra days are unpaid' : ''}
      </p>
      <p className="break-words text-sm text-fg">&ldquo;{leave.reason}&rdquo;</p>
      {leave.decisionReason && (
        <p className="break-words text-sm text-fg">Answer: &ldquo;{leave.decisionReason}&rdquo;</p>
      )}
      {leave.status === 'pending' && leave.cannotDecideBecause && (
        <p className="text-xs text-fg-muted">You cannot decide this: {leave.cannotDecideBecause}</p>
      )}
      {((leave.canDecide && !rejecting) || leave.canCancel) && (
        <div className={actionRow}>
          {leave.canDecide && !rejecting && (
            <>
              <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </>
          )}
          {leave.canCancel && (
            <Button
              size="sm"
              variant="secondary"
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel leave
            </Button>
          )}
        </div>
      )}
      {rejecting && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason for rejecting (required)"
            className={input}
          />
          <div className={actionRow}>
            <Button
              size="sm"
              disabled={reason.trim().length === 0}
              loading={reject.isPending}
              onClick={() => reject.mutate()}
            >
              Reject leave
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
              Back
            </Button>
          </div>
        </div>
      )}
      {error && (
        <Banner tone="danger" title="Leave action failed">
          {error}
        </Banner>
      )}
    </li>
  );
}

export default function LeavePage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const enabled = Boolean(session?.activeMemberId);
  const canDecide =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const canRequest =
    session?.role === 'coo' || session?.role === 'manager' || session?.role === 'employee';
  const canSeeTeam = session?.role === 'coo' || session?.role === 'manager';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const balance = useQuery({
    queryKey: ['hrms', 'leave', 'balance', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: LeaveBalance[] }>('/leave/balance'),
    enabled: enabled && canRequest,
  });
  const mine = useQuery({
    queryKey: ['hrms', 'leave', 'mine', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=mine'),
    enabled: enabled && canRequest,
  });
  const toDecide = useQuery({
    queryKey: ['hrms', 'leave', 'decide', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=decide'),
    enabled: enabled && canDecide,
  });
  const team = useQuery({
    queryKey: ['hrms', 'leave', 'team', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=team'),
    enabled: enabled && canSeeTeam,
  });

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'leave'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'requests'] });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRequest) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    setError(null);
    setPending(true);
    try {
      await hrmsFetch('/leave', {
        method: 'POST',
        body: {
          leaveTypeId: String(f.get('type')),
          startDate: String(f.get('start')),
          endDate: String(f.get('end')),
          startHalfDay: f.get('startHalf') === 'on',
          endHalfDay: f.get('endHalf') === 'on',
          reason: String(f.get('reason')).trim(),
        },
      });
      form.reset();
      changed();
      toast({
        title: 'Leave request sent',
        description: 'Your request is waiting for a decision.',
        tone: 'success',
      });
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  const decideIds = new Set((toDecide.data?.items ?? []).map((l) => l.requestId));
  const teamRest = (team.data?.items ?? []).filter(
    (l) => !decideIds.has(l.requestId) && l.member.id !== session?.activeMemberId,
  );

  return (
    <PageShell>
      <PageHeader
        title={
          session?.role === 'ceo' ? 'Leave approvals' : canDecide ? 'Leave & approvals' : 'My leave'
        }
        description={
          session?.role === 'ceo'
            ? 'Review leave requests assigned to you.'
            : canDecide
              ? 'Submit your own leave and review requests assigned to you.'
              : 'Check your allowance and track your leave requests.'
        }
      />

      {canRequest && balance.isLoading && (
        <div
          className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
          aria-label="Loading leave balance"
        >
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      )}
      {canRequest && balance.error && (
        <ErrorState
          title="Could not load leave balance"
          message={message(balance.error)}
          onRetry={() => void balance.refetch()}
        />
      )}

      {canRequest && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {balance.data?.items.map((b) => (
            <div
              key={b.leaveTypeId}
              className="min-w-0 rounded-card border border-border bg-surface p-4"
            >
              <p className="truncate text-sm text-fg-muted">
                {b.name} {b.year}
                {b.isPaid ? '' : ' (unpaid)'}
              </p>
              <p className="text-3xl font-bold tabular-nums text-fg">{b.remaining}</p>
              <p className="text-xs text-fg-muted">
                of {b.allowance} days left · {b.used} used
              </p>
            </div>
          ))}
        </section>
      )}

      <div
        className={
          canRequest
            ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]'
            : 'space-y-6'
        }
      >
        {canRequest && (
          <form
            onSubmit={onSubmit}
            className="space-y-3 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-20"
          >
            <SectionHeading
              title="Ask for leave"
              description="Choose the dates and explain what you need."
            />
            <label htmlFor="leave-type" className="block space-y-1 text-sm text-fg">
              Leave type
              <select id="leave-type" name="type" required className={input}>
                <option value="">Choose a leave type</option>
                {balance.data?.items.map((b) => (
                  <option key={b.leaveTypeId} value={b.leaveTypeId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 space-y-1 text-sm text-fg">
                From
                <input name="start" type="date" required className={input} />
              </label>
              <label className="block min-w-0 space-y-1 text-sm text-fg">
                To
                <input name="end" type="date" required className={input} />
              </label>
            </div>
            <div className="space-y-2 text-sm text-fg">
              <label className="flex items-center gap-2">
                <input name="startHalf" type="checkbox" /> First day is a half day
              </label>
              <label className="flex items-center gap-2">
                <input name="endHalf" type="checkbox" /> Last day is a half day
              </label>
            </div>
            <label htmlFor="leave-reason" className="block space-y-1 text-sm text-fg">
              Reason
              <textarea
                id="leave-reason"
                name="reason"
                required
                rows={3}
                maxLength={1000}
                placeholder="Explain why you need leave"
                className={input}
              />
            </label>
            <p className="text-xs text-fg-muted">
              Friday and Saturday plus holidays are not counted.{' '}
              {session?.role === 'coo'
                ? 'The CEO decides your request.'
                : 'Your project lead or the COO decides.'}
            </p>
            {error && (
              <Banner tone="danger" title="Could not send leave request">
                {error}
              </Banner>
            )}
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Sending…"
              className="w-full sm:w-auto"
            >
              Send request
            </Button>
          </form>
        )}

        <div className="min-w-0 space-y-6">
          {canDecide && (
            <section className="space-y-3">
              <SectionHeading title="To decide" description="Requests waiting for your decision." />
              {toDecide.error && (
                <ErrorState
                  title="Could not load requests to decide"
                  message={message(toDecide.error)}
                  onRetry={() => void toDecide.refetch()}
                />
              )}
              {toDecide.data && toDecide.data.items.length === 0 && (
                <EmptyState
                  title="Nothing to decide"
                  description="New leave requests will appear here."
                />
              )}
              <ul className="space-y-3">
                {toDecide.data?.items.map((l) => (
                  <LeaveItem key={l.requestId} leave={l} showPerson onChanged={changed} />
                ))}
              </ul>
            </section>
          )}

          {canRequest && (
            <section className="space-y-3">
              <SectionHeading title="My leave" description="Your submitted leave requests." />
              {mine.error && (
                <ErrorState
                  title="Could not load your leave"
                  message={message(mine.error)}
                  onRetry={() => void mine.refetch()}
                />
              )}
              {mine.data && mine.data.items.length === 0 && (
                <EmptyState
                  title="No leave requests yet"
                  description="Your submitted requests will appear here."
                />
              )}
              <ul className="space-y-3">
                {mine.data?.items.map((l) => (
                  <LeaveItem key={l.requestId} leave={l} showPerson={false} onChanged={changed} />
                ))}
              </ul>
            </section>
          )}

          {canSeeTeam && teamRest.length > 0 && (
            <section className="space-y-3">
              <SectionHeading title="Team leave" description="Approved leave across your team." />
              <ul className="space-y-3">
                {teamRest.map((l) => (
                  <LeaveItem key={l.requestId} leave={l} showPerson onChanged={changed} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
