'use client';

import { Plus } from 'lucide-react';
import { Button, EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui';
import { StatusChips, TaskRow } from '@/components/hrms/project-card';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import type { HrmsProject, HrmsTask, Paginated } from '@/lib/hrms/types';

const select =
  'min-h-10 w-full min-w-0 rounded-control border border-border bg-surface px-3 py-2 text-sm';

function TasksList() {
  const { session } = useHrmsAuth();
  const initialProject = useSearchParams().get('projectId') ?? '';
  const [projectId, setProjectId] = useState(initialProject);
  const [mine, setMine] = useState(session?.role === 'employee');
  const [status, setStatus] = useState('');
  const [urgency, setUrgency] = useState('');
  const [flag, setFlag] = useState('');
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (projectId) params.set('projectId', projectId);
  if (mine) params.set('mine', 'true');
  if (status) params.set('status', status);
  if (urgency) params.set('urgency', urgency);
  if (flag) params.set('flag', flag);
  if (open && !status) params.set('open', 'true');

  const enabled = Boolean(session?.activeMemberId);
  const tasks = useQuery({
    queryKey: ['hrms', 'tasks', session?.activeMemberId, params.toString()],
    queryFn: () => hrmsFetch<Paginated<HrmsTask>>(`/tasks?${params.toString()}`),
    enabled,
  });
  const projects = useQuery({
    queryKey: ['hrms', 'projects', session?.activeMemberId, 'picker'],
    queryFn: () => hrmsFetch<Paginated<HrmsProject>>('/projects?pageSize=100'),
    enabled,
  });
  const canCreate =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tasks</h1>
        {canCreate && (
          <Button asChild>
            <Link href={`/tasks/new${projectId ? `?projectId=${projectId}` : ''}`}>
              <Plus aria-hidden className="size-4" />
              New task
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        <select
          aria-label="Project"
          value={projectId}
          onChange={(e) => reset(() => setProjectId(e.target.value))}
          className={select}
        >
          <option value="">All projects</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Urgency"
          value={urgency}
          onChange={(e) => reset(() => setUrgency(e.target.value))}
          className={select}
        >
          <option value="">Any urgency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Flag"
          value={flag}
          onChange={(e) => reset(() => setFlag(e.target.value))}
          className={select}
        >
          <option value="">No flag filter</option>
          <option value="overdue">Overdue</option>
          <option value="no_assignee">No assignee</option>
          <option value="no_manager">No manager</option>
          <option value="no_employee">No employee</option>
        </select>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2 md:col-span-4">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => reset(() => setMine(e.target.checked))}
            />
            Mine
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={open}
              onChange={(e) => reset(() => setOpen(e.target.checked))}
            />
            Open only
          </label>
        </div>
      </div>

      <StatusChips
        value={status}
        onChange={(v) => reset(() => setStatus(v))}
        anyLabel="Any status"
        statuses={['todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled']}
      />

      {tasks.isLoading && (
        <div className="space-y-2" aria-label="Loading tasks">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-12" />
          ))}
        </div>
      )}
      {tasks.error && (
        <ErrorState
          title="Could not load tasks"
          message={(tasks.error as Error).message}
          onRetry={() => void tasks.refetch()}
        />
      )}

      {tasks.data && tasks.data.items.length > 0 && (
        <ul className="space-y-0.5 rounded-card bg-surface-raised p-2">
          {tasks.data.items.map((t) => (
            <TaskRow key={t.id} task={t} showProject />
          ))}
        </ul>
      )}
      {tasks.data?.items.length === 0 && (
        <EmptyState
          title="No tasks match"
          description="Try changing the filters or create a new task."
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/tasks/new">New task</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {tasks.data && (
        <Pagination
          page={page}
          pageSize={tasks.data.pageSize}
          total={tasks.data.total}
          onPage={setPage}
        />
      )}
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksList />
    </Suspense>
  );
}
