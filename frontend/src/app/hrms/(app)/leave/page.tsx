'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { HrmsApiError, hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsLeave, LeaveBalance, RequestStatus } from '@/lib/hrms/types';

const input =
  'w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen';
const primary =
  'rounded-xl bg-evergreen px-3 py-1.5 text-sm font-medium text-white hover:bg-evergreen-dark disabled:opacity-60';
const secondary = 'rounded-xl border border-charcoal/15 px-3 py-1.5 text-sm hover:bg-mist/60 disabled:opacity-60';

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

function LeaveItem({ leave, showPerson, onChanged }: { leave: HrmsLeave; showPerson: boolean; onChanged: () => void }) {
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
      hrmsFetch(`/requests/${leave.requestId}/reject`, { method: 'POST', body: { reason: reason.trim() } }),
    ...settle,
  });
  const cancel = useMutation({
    mutationFn: () => hrmsFetch(`/leave/${leave.requestId}/cancel`, { method: 'POST' }),
    ...settle,
  });

  return (
    <li className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
      <p className="text-sm text-charcoal">
        {showPerson && <span className="font-medium">{leave.member.fullName} · </span>}
        {leave.leaveType.name}, {span(leave)} · {leave.days} working {leave.days === 1 ? 'day' : 'days'}
      </p>
      <p className="text-xs text-charcoal-soft">
        {STATUS[leave.status]}
        {leave.decidedBy ? ` by ${leave.decidedBy}` : ''}
        {leave.overAllowance ? ' · over the allowance, the extra days are unpaid' : ''}
      </p>
      <p className="text-sm text-charcoal">&ldquo;{leave.reason}&rdquo;</p>
      {leave.decisionReason && <p className="text-sm text-charcoal">Answer: &ldquo;{leave.decisionReason}&rdquo;</p>}
      {leave.status === 'pending' && leave.cannotDecideBecause && (
        <p className="text-xs text-charcoal-soft">You cannot decide this: {leave.cannotDecideBecause}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {leave.canDecide && !rejecting && (
          <>
            <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className={primary}>
              Approve
            </button>
            <button type="button" onClick={() => setRejecting(true)} className={secondary}>
              Reject
            </button>
          </>
        )}
        {leave.canCancel && (
          <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()} className={secondary}>
            Cancel leave
          </button>
        )}
      </div>
      {rejecting && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason for rejecting (required)"
            className={input}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0 || reject.isPending}
              onClick={() => reject.mutate()}
              className={primary}
            >
              Reject leave
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={secondary}>
              Back
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert-deep">
          {error}
        </p>
      )}
    </li>
  );
}

export default function LeavePage() {
  const { session } = useHrmsAuth();
  const queryClient = useQueryClient();
  const enabled = Boolean(session?.activeMemberId);
  const canDecide = session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const balance = useQuery({
    queryKey: ['hrms', 'leave', 'balance', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: LeaveBalance[] }>('/leave/balance'),
    enabled,
  });
  const mine = useQuery({
    queryKey: ['hrms', 'leave', 'mine', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=mine'),
    enabled,
  });
  const toDecide = useQuery({
    queryKey: ['hrms', 'leave', 'decide', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=decide'),
    enabled: enabled && canDecide,
  });
  const team = useQuery({
    queryKey: ['hrms', 'leave', 'team', session?.activeMemberId],
    queryFn: () => hrmsFetch<{ items: HrmsLeave[] }>('/leave?scope=team'),
    enabled: enabled && canDecide,
  });

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'leave'] });
    void queryClient.invalidateQueries({ queryKey: ['hrms', 'requests'] });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <>
      <h1 className="text-xl font-semibold text-charcoal">Leave</h1>

      <section className="grid gap-3 sm:grid-cols-3">
        {balance.data?.items.map((b) => (
          <div key={b.leaveTypeId} className="rounded-2xl border border-charcoal/10 bg-white p-4">
            <p className="text-sm text-charcoal-soft">
              {b.name} {b.year}
              {b.isPaid ? '' : ' (unpaid)'}
            </p>
            <p className="text-2xl font-semibold text-charcoal">{b.remaining}</p>
            <p className="text-xs text-charcoal-soft">
              of {b.allowance} days left · {b.used} used
            </p>
          </div>
        ))}
      </section>

      <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4">
        <h2 className="font-medium text-charcoal">Ask for leave</h2>
        <select name="type" required className={input} aria-label="Leave type">
          <option value="">Type…</option>
          {balance.data?.items.map((b) => (
            <option key={b.leaveTypeId} value={b.leaveTypeId}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm text-charcoal">
            From
            <input name="start" type="date" required className={input} />
          </label>
          <label className="block space-y-1 text-sm text-charcoal">
            To
            <input name="end" type="date" required className={input} />
          </label>
        </div>
        <div className="flex gap-4 text-sm text-charcoal">
          <label className="flex items-center gap-2">
            <input name="startHalf" type="checkbox" /> First day is a half day
          </label>
          <label className="flex items-center gap-2">
            <input name="endHalf" type="checkbox" /> Last day is a half day
          </label>
        </div>
        <textarea name="reason" required rows={2} maxLength={1000} placeholder="Reason" className={input} />
        <p className="text-xs text-charcoal-soft">
          Weekends and holidays are not counted. Your project lead or the COO decides.
        </p>
        {error && (
          <p role="alert" className="text-sm text-alert-deep">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Sending…' : 'Send request'}
        </button>
      </form>

      {canDecide && (
        <section className="space-y-2">
          <h2 className="font-medium text-charcoal">To decide</h2>
          {toDecide.data && toDecide.data.items.length === 0 && (
            <p className="text-sm text-charcoal-soft">Nothing is waiting for you.</p>
          )}
          <ul className="space-y-3">
            {toDecide.data?.items.map((l) => (
              <LeaveItem key={l.requestId} leave={l} showPerson onChanged={changed} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium text-charcoal">My leave</h2>
        {mine.data && mine.data.items.length === 0 && (
          <p className="text-sm text-charcoal-soft">No leave requests yet.</p>
        )}
        <ul className="space-y-3">
          {mine.data?.items.map((l) => (
            <LeaveItem key={l.requestId} leave={l} showPerson={false} onChanged={changed} />
          ))}
        </ul>
      </section>

      {canDecide && teamRest.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-charcoal">Team leave</h2>
          <ul className="space-y-3">
            {teamRest.map((l) => (
              <LeaveItem key={l.requestId} leave={l} showPerson onChanged={changed} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
