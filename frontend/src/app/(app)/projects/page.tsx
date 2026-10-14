'use client';

import { Pagination } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ProgressBar } from '@/components/hrms/progress-bar';
import { ProjectFlags, ProjectStatusBadge } from '@/components/hrms/project-status';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsProject, Paginated, RatingsDueProject } from '@/lib/hrms/types';

export default function ProjectsPage() {
  const { session } = useHrmsAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  if (q.trim()) params.set('q', q.trim());

  const projects = useQuery({
    queryKey: ['hrms', 'projects', session?.activeMemberId, params.toString()],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>(`/projects?${params.toString()}`),
    enabled: Boolean(session?.activeMemberId),
  });
  const canRate = session?.role === 'manager' || session?.role === 'employee';
  const due = useQuery({
    queryKey: ['hrms', 'ratings-due'],
    queryFn: () => hrmsFetch<{ items: RatingsDueProject[] }>('/me/ratings-due'),
    enabled: canRate && Boolean(session?.activeMemberId),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-charcoal">Projects</h1>
        {session?.role === 'ceo' && (
          <Link
            href="/projects/new"
            className="rounded-xl bg-evergreen px-3 py-2 text-sm font-medium text-white hover:bg-evergreen-dark"
          >
            New project
          </Link>
        )}
      </div>

      {due.data && due.data.items.length > 0 && (
        <Link
          href="/ratings"
          className="block rounded-2xl border border-evergreen/30 bg-mist p-3 text-sm text-forest hover:underline"
        >
          {due.data.items.length} finished {due.data.items.length === 1 ? 'project is' : 'projects are'} waiting for
          your ratings.
        </Link>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search projects"
          placeholder="Search by name"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-xl border border-charcoal/15 px-3 py-2 text-sm outline-none focus:border-evergreen"
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-charcoal/15 px-3 py-2 text-sm"
        >
          <option value="">Current</option>
          <option value="active">Active</option>
          <option value="pending_lead_approval">Pending lead approval</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {projects.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {projects.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {(projects.error as Error).message}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.data?.items.map((p) => (
          <li key={p.id} className="space-y-2 rounded-2xl border border-charcoal/10 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link
                href={`/projects/${p.id}`}
                className="font-semibold text-forest hover:underline"
              >
                {p.name}
              </Link>
              <ProjectStatusBadge status={p.status} />
            </div>
            <ProgressBar progress={p.progress} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
              <span>
                {p.managerCount} manager{p.managerCount === 1 ? '' : 's'} · {p.employeeCount}{' '}
                employee{p.employeeCount === 1 ? '' : 's'}
              </span>
              {p.dueDate && <span>Due {p.dueDate}</span>}
              {p.iAmLead && <span className="rounded-full bg-mist px-2 py-0.5 text-forest">Lead</span>}
              <ProjectFlags flags={p.flags} />
            </div>
          </li>
        ))}
      </ul>
      {projects.data?.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No projects to show.</p>
      )}

      {projects.data && (
        <Pagination page={page} pageSize={projects.data.pageSize} total={projects.data.total} onPage={setPage} />
      )}
    </>
  );
}
