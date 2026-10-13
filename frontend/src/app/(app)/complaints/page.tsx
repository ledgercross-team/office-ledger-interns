'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, formatDateTime } from '@/lib/format';
import type { Complaint, ComplaintCategory } from '@/lib/types';

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'workplace', label: 'Workplace' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'harassment', label: 'Harassment or conduct' },
  { value: 'other', label: 'Other' },
];

function complaintStatus(status: Complaint['status']): string {
  return status === 'in_review' ? 'In review' : status.charAt(0).toUpperCase() + status.slice(1);
}

function ComplaintContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ComplaintCategory>('workplace');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const complaints = useQuery({
    queryKey: ['employee-services', 'complaints'],
    queryFn: () => apiFetch<{ items: Complaint[] }>('/employee-services/complaints'),
    enabled: user?.role === 'employee',
  });
  const create = useMutation({
    mutationFn: (body: { category: ComplaintCategory; subject: string; details: string }) =>
      apiFetch<Complaint>('/employee-services/complaints', { method: 'POST', body }),
    onSuccess: async () => {
      setNotice('Your complaint was submitted.');
      setSubject('');
      setDetails('');
      await queryClient.invalidateQueries({ queryKey: ['employee-services', 'complaints'] });
    },
  });
  const complaintItems = complaints.data?.items ?? [];
  const openCount = complaintItems.filter((item) => item.status !== 'resolved').length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    create.mutate({ category, subject: subject.trim(), details: details.trim() });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-3xl bg-forest text-white shadow-[0_12px_30px_rgba(28,43,37,0.16)]">
        <div className="p-5 sm:p-8">
          <p className="text-sm font-semibold text-mint">Issues</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Report an issue</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-mist/80 sm:text-base">
            Share a workplace concern and keep track of its review from one place.
          </p>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-charcoal sm:text-xl">New report</h2>
            <p className="mt-1 text-sm text-charcoal-soft">Give enough detail for the issue to be reviewed properly.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="complaint-subject" className="block text-sm font-semibold text-charcoal">Subject</label>
            <input
              id="complaint-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={200}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-evergreen focus:ring-2 focus:ring-evergreen/15"
              placeholder="Briefly describe the concern"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="complaint-details" className="block text-sm font-semibold text-charcoal">Details</label>
            <textarea
              id="complaint-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              required
              maxLength={5000}
              rows={7}
              className="w-full resize-y rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-evergreen focus:ring-2 focus:ring-evergreen/15"
              placeholder="Share what happened and any useful context."
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="complaint-category" className="block text-sm font-semibold text-charcoal">Category</label>
            <select
              id="complaint-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ComplaintCategory)}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-evergreen focus:ring-2 focus:ring-evergreen/15"
            >
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          {(notice || create.error) && (
            <div className={`rounded-xl px-3 py-2.5 text-sm ${create.error ? 'bg-alert/10 text-alert-deep' : 'bg-mist text-evergreen'}`}>
              {create.error ? errorMessage(create.error) : notice}
            </div>
          )}

          <div className="flex justify-end border-t border-charcoal/10 pt-4">
            <button
              type="submit"
              disabled={create.isPending}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {create.isPending ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>

        <section className="space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-charcoal sm:text-xl">Open issues</h2>
              <p className="mt-1 text-sm text-charcoal-soft">{openCount} unresolved {openCount === 1 ? 'report' : 'reports'}</p>
            </div>
            <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-forest">
              {complaintItems.length} total
            </span>
          </div>

          {complaints.isLoading && <p className="text-sm text-charcoal-soft">Loading reports…</p>}
          {complaints.error && <p role="alert" className="rounded-xl bg-alert/10 px-3 py-2.5 text-sm text-alert-deep">{errorMessage(complaints.error)}</p>}
          {!complaints.isLoading && !complaints.error && complaintItems.length === 0 && (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-evergreen/25 bg-mist/30 px-5 text-center">
              <p className="font-semibold text-charcoal">No open issues</p>
              <p className="mt-1 text-sm text-charcoal-soft">New reports will appear here immediately.</p>
            </div>
          )}
          {complaintItems.length > 0 && (
            <div className="space-y-3">
              {complaintItems.map((item) => (
                <article key={item.id} className="rounded-xl border border-charcoal/10 bg-white p-4 transition-colors hover:border-evergreen/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-charcoal">{item.subject}</h3>
                      <p className="mt-1 text-xs capitalize text-charcoal-soft">{item.category.replace('_', ' ')}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-forest">{complaintStatus(item.status)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-charcoal-soft">{item.details}</p>
                  {item.response && <p className="mt-3 rounded-lg bg-mist p-3 text-sm text-forest"><span className="font-semibold">Response:</span> {item.response}</p>}
                  <p className="mt-3 text-xs text-charcoal-soft">Submitted {formatDateTime(item.createdAt, user?.companyTimezone)}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ComplaintsPage() {
  return <RoleGate allow={['employee']}><ComplaintContent /></RoleGate>;
}
