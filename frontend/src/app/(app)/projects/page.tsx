'use client';

import { Plus } from 'lucide-react';
import { Button, Pagination } from '@/components/ui';
import { ProjectCard } from '@/components/hrms/project-card';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
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
        <h1 className="text-2xl font-bold">Projects</h1>
        {session?.role === 'ceo' && (
          <Button asChild>
            <Link href="/projects/new">
              <Plus aria-hidden className="size-4" />
              New project
            </Link>
          </Button>
        )}
      </div>

      {due.data && due.data.items.length > 0 && (
        <Link
          href="/ratings"
          className="block rounded-card bg-primary-soft p-3 text-sm text-fg hover:underline"
        >
          {due.data.items.length} finished{' '}
          {due.data.items.length === 1 ? 'project is' : 'projects are'} waiting for your ratings.
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[
          ['', 'Current'],
          ['active', 'Active'],
          ['pending_lead_approval', 'Pending approval'],
          ['completed', 'Completed'],
          ['archived', 'Archived'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-[transform,background-color] duration-150 hover:-translate-y-px active:scale-95 motion-reduce:transform-none ${status === value ? 'border-fg bg-fg text-bg' : 'border-border bg-surface hover:bg-surface-sunken'}`}
          >
            {label}
          </button>
        ))}
        <input
          aria-label="Search projects"
          placeholder="Search by name"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {projects.isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
      {projects.error && (
        <p role="alert" className="text-sm text-danger-fg">
          {(projects.error as Error).message}
        </p>
      )}

      <ul className="grid items-start gap-4 lg:grid-cols-2">
        {projects.data?.items.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </ul>
      {projects.data?.items.length === 0 && (
        <p className="text-sm text-fg-muted">No projects to show.</p>
      )}

      {projects.data && (
        <Pagination
          page={page}
          pageSize={projects.data.pageSize}
          total={projects.data.total}
          onPage={setPage}
        />
      )}
    </>
  );
}
