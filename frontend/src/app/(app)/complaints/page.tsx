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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    create.mutate({ category, subject: subject.trim(), details: details.trim() });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Complaints</h1>
        <p className="mt-1 text-sm text-charcoal-soft">Raise a workplace concern and keep a record of your submissions.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="complaint-category" className="block text-sm font-medium text-charcoal">Category</label>
            <select
              id="complaint-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ComplaintCategory)}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none focus:border-evergreen"
            >
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="complaint-subject" className="block text-sm font-medium text-charcoal">Subject</label>
            <input
              id="complaint-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={200}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen"
              placeholder="Briefly describe the concern"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="complaint-details" className="block text-sm font-medium text-charcoal">Details</label>
          <textarea
            id="complaint-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            required
            maxLength={5000}
            rows={6}
            className="w-full resize-y rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen"
            placeholder="Share what happened and any useful context."
          />
        </div>
        {notice && <p role="status" className="text-sm text-evergreen">{notice}</p>}
        {create.error && <p role="alert" className="text-sm text-alert-deep">{errorMessage(create.error)}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-evergreen px-4 py-2.5 text-sm font-semibold text-white hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.isPending ? 'Submitting…' : 'Submit complaint'}
        </button>
      </form>

      <section className="space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-6">
        <div>
          <h2 className="font-semibold text-charcoal">Your complaints</h2>
          <p className="mt-1 text-sm text-charcoal-soft">Updates will appear here when your complaint is reviewed.</p>
        </div>
        {complaints.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
        {complaints.error && <p role="alert" className="text-sm text-alert-deep">{errorMessage(complaints.error)}</p>}
        {complaints.data?.items.length === 0 && <p className="text-sm text-charcoal-soft">No complaints yet.</p>}
        {complaints.data && complaints.data.items.length > 0 && (
          <div className="space-y-3">
            {complaints.data.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-charcoal/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-charcoal">{item.subject}</h3>
                    <p className="mt-1 text-xs capitalize text-charcoal-soft">{item.category.replace('_', ' ')}</p>
                  </div>
                  <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-forest">{complaintStatus(item.status)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-charcoal-soft">{item.details}</p>
                {item.response && <p className="mt-3 rounded-lg bg-mist p-3 text-sm text-forest">Response: {item.response}</p>}
                <p className="mt-3 text-xs text-charcoal-soft">Submitted {formatDateTime(item.createdAt, user?.companyTimezone)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ComplaintsPage() {
  return <RoleGate allow={['employee']}><ComplaintContent /></RoleGate>;
}
