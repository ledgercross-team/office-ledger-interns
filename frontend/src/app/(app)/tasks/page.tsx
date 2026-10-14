'use client';

import { Pagination } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { TaskFlags, TaskStatusBadge, UrgencyBadge } from '@/components/hrms/task-badges';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { TASK_STATUS_LABELS } from '@/lib/hrms/task-meta';
import type { HrmsProject, HrmsTask, Paginated } from '@/lib/hrms/types';

const select = 'rounded-xl border border-charcoal/15 px-3 py-2 text-sm';

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
  const canCreate = session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-charcoal">Tasks</h1>
        {canCreate && (
          <Link
            href={`/tasks/new${projectId ? `?projectId=${projectId}` : ''}`}
            className="rounded-xl bg-evergreen px-3 py-2 text-sm font-medium text-white hover:bg-evergreen-dark"
          >
            New task
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Project" value={projectId} onChange={(e) => reset(() => setProjectId(e.target.value))} className={select}>
          <option value="">All projects</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => reset(() => setStatus(e.target.value))} className={select}>
          <option value="">Any status</option>
          {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Urgency" value={urgency} onChange={(e) => reset(() => setUrgency(e.target.value))} className={select}>
          <option value="">Any urgency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select aria-label="Flag" value={flag} onChange={(e) => reset(() => setFlag(e.target.value))} className={select}>
          <option value="">No flag filter</option>
          <option value="overdue">Overdue</option>
          <option value="no_assignee">No assignee</option>
          <option value="no_manager">No manager</option>
          <option value="no_employee">No employee</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-charcoal">
          <input type="checkbox" checked={mine} onChange={(e) => reset(() => setMine(e.target.checked))} />
          Mine
        </label>
        <label className="flex items-center gap-1 text-sm text-charcoal">
          <input type="checkbox" checked={open} onChange={(e) => reset(() => setOpen(e.target.checked))} />
          Open only
        </label>
      </div>

      {tasks.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {tasks.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {(tasks.error as Error).message}
        </p>
      )}

      <ul className="space-y-2">
        {tasks.data?.items.map((t) => (
          <li key={t.id} className="space-y-1 rounded-2xl border border-charcoal/10 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`/tasks/${t.id}`} className="font-medium text-forest hover:underline">
                {t.title}
              </Link>
              <span className="flex flex-wrap gap-1">
                <UrgencyBadge urgency={t.urgency} />
                <TaskStatusBadge status={t.status} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
              <span>{t.projectName}</span>
              <span>Due {t.dueAt.slice(0, 10)}</span>
              <span>
                {t.assignees.length === 0 ? 'Nobody assigned' : t.assignees.map((a) => a.fullName).join(', ')}
              </span>
              <TaskFlags flags={t.flags} />
            </div>
          </li>
        ))}
      </ul>
      {tasks.data?.items.length === 0 && <p className="text-sm text-charcoal-soft">No tasks match.</p>}

      {tasks.data && (
        <Pagination page={page} pageSize={tasks.data.pageSize} total={tasks.data.total} onPage={setPage} />
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
