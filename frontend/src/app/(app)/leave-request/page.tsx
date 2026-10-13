'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DateInput } from '@/components/date-input';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDate, formatDateTime, todayIn } from '@/lib/format';
import type { LeaveRequest, LeaveType } from '@/lib/types';

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'personal', label: 'Personal leave' },
  { value: 'emergency', label: 'Emergency leave' },
];

function statusLabel(status: LeaveRequest['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: LeaveRequest['status']): string {
  if (status === 'approved') return 'bg-mint text-forest';
  if (status === 'rejected') return 'bg-alert-tint text-alert-deep';
  return 'bg-amber-tint text-amber-deep';
}

function LeaveRequestContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = todayIn(user?.companyTimezone);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startOn, setStartOn] = useState('');
  const [endOn, setEndOn] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ['employee-services', 'leave-requests'],
    queryFn: () => apiFetch<{ items: LeaveRequest[] }>('/employee-services/leave-requests'),
    enabled: user?.role === 'employee',
  });

  const create = useMutation({
    mutationFn: (body: { leaveType: LeaveType; startOn: string; endOn: string; reason: string }) =>
      apiFetch<LeaveRequest>('/employee-services/leave-requests', { method: 'POST', body }),
    onSuccess: async () => {
      setNotice('Your leave request was submitted for review.');
      setStartOn('');
      setEndOn('');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['employee-services', 'leave-requests'] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    create.mutate({ leaveType, startOn, endOn, reason: reason.trim() });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Leave request</h1>
        <p className="mt-1 text-sm text-charcoal-soft">Request time away and keep track of your submitted requests.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <label htmlFor="leave-type" className="block text-sm font-medium text-charcoal">Leave type</label>
            <select
              id="leave-type"
              value={leaveType}
              onChange={(event) => setLeaveType(event.target.value as LeaveType)}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none focus:border-evergreen"
            >
              {LEAVE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="leave-start" className="block text-sm font-medium text-charcoal">Start date</label>
            <DateInput
              id="leave-start"
              value={startOn}
              min={today}
              required
              onChange={(event) => {
                setStartOn(event.target.value);
                if (endOn && event.target.value > endOn) setEndOn(event.target.value);
              }}
              className="w-full rounded-xl border border-charcoal/15 bg-white text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="leave-end" className="block text-sm font-medium text-charcoal">End date</label>
            <DateInput
              id="leave-end"
              value={endOn}
              min={startOn || today}
              required
              onChange={(event) => setEndOn(event.target.value)}
              className="w-full rounded-xl border border-charcoal/15 bg-white text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="leave-reason" className="block text-sm font-medium text-charcoal">Reason</label>
          <textarea
            id="leave-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={2000}
            rows={4}
            className="w-full resize-y rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen"
            placeholder="Add any context your manager should know."
          />
        </div>
        {notice && <p role="status" className="text-sm text-evergreen">{notice}</p>}
        {create.error && <p role="alert" className="text-sm text-alert-deep">{errorMessage(create.error)}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-evergreen px-4 py-2.5 text-sm font-semibold text-white hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.isPending ? 'Submitting…' : 'Submit leave request'}
        </button>
      </form>

      <section className="space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
        <div>
          <h2 className="font-semibold text-charcoal">Your requests</h2>
          <p className="mt-1 text-sm text-charcoal-soft">A request stays pending until it is reviewed.</p>
        </div>
        {requests.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {requests.error && <p role="alert" className="text-sm text-alert-deep">{errorMessage(requests.error)}</p>}
        {requests.data?.items.length === 0 && <p className="text-sm text-charcoal-soft">No leave requests yet.</p>}
        {requests.data && requests.data.items.length > 0 && (
          <div className="space-y-3">
            {requests.data.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-charcoal/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-charcoal">
                      {LEAVE_TYPES.find((type) => type.value === item.leaveType)?.label ?? item.leaveType}
                    </h3>
                    <p className="mt-1 text-sm text-charcoal-soft">{formatDate(item.startOn)} – {formatDate(item.endOn)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-charcoal-soft">{item.reason}</p>
                <p className="mt-3 text-xs text-charcoal-soft">Submitted {formatDateTime(item.createdAt, user?.companyTimezone)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function LeaveRequestPage() {
  return <RoleGate allow={['employee']}><LeaveRequestContent /></RoleGate>;
}
