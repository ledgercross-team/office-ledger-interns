'use client';

import { Plus } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  PageShell,
  Pagination,
  Skeleton,
} from '@/components/ui';
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
    <PageShell>
      <PageHeader
        title="Projects"
        description="Track project progress, people, tasks, and completion decisions."
        primaryAction={
          session?.role === 'ceo' ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus aria-hidden className="size-4" />
                New project
              </Link>
            </Button>
          ) : undefined
        }
      />

      {due.data && due.data.items.length > 0 && (
        <Link
          href="/ratings"
          className="block rounded-card bg-primary-soft p-3 text-sm text-fg hover:underline"
        >
          {due.data.items.length} finished{' '}
          {due.data.items.length === 1 ? 'project is' : 'projects are'} waiting for your ratings.
        </Link>
      )}

      <FilterBar
        search={q}
        searchLabel="Search projects"
        onSearchChange={(value) => {
          setQ(value);
          setPage(1);
        }}
      >
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
            className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-[transform,background-color] duration-150 hover:-translate-y-px active:scale-95 motion-reduce:transform-none ${status === value ? 'border-fg bg-fg text-bg' : 'border-border bg-surface-raised hover:bg-surface-sunken'}`}
          >
            {label}
          </button>
        ))}
      </FilterBar>

      {projects.isLoading && (
        <div className="grid w-full gap-4" aria-label="Loading projects">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-56" />
          ))}
        </div>
      )}
      {projects.error && (
        <ErrorState
          title="Could not load projects"
          message={(projects.error as Error).message}
          onRetry={() => void projects.refetch()}
        />
      )}

      {projects.data?.items.length === 0 && (
        <EmptyState
          title="No projects found"
          description={
            q || status
              ? 'Try changing the filters or search terms.'
              : 'Create a project to start organising work.'
          }
          action={
            session?.role === 'ceo' ? (
              <Button asChild>
                <Link href="/projects/new">New project</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {projects.data && projects.data.items.length > 0 && (
        <ul className="grid w-full items-start gap-4">
          {projects.data.items.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}

      {projects.data && (
        <Pagination
          page={page}
          pageSize={projects.data.pageSize}
          total={projects.data.total}
          onPage={setPage}
        />
      )}
    </PageShell>
  );
}
