'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  AvatarStack,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@/components/ui';
import { ProjectFlags, ProjectStatusBadge } from '@/components/hrms/project-status';
import { hrmsFetch } from '@/lib/hrms/api-client';
import { useHrmsAuth } from '@/lib/hrms/auth-context';
import { cn } from '@/lib/cn';
import { TASK_STATUSES } from '@/lib/hrms/status-vocabulary';
import type { HrmsProject, HrmsTask, Paginated, TaskStatus } from '@/lib/hrms/types';

const CHIP_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

/** Done count in the middle, the share of finished tasks as the arc. */
export function ProgressRing({ done, percent }: { done: number; percent: number | null }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const filled = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <span
      role="img"
      aria-label={
        percent === null ? 'No tasks yet' : `${done} tasks done, ${Math.round(filled)} percent`
      }
      className="relative inline-flex size-11 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-success transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - filled / 100)}
        />
      </svg>
      <span className="relative text-sm font-bold tabular-nums">
        {percent === null ? '–' : done}
      </span>
    </span>
  );
}

export function StatusChips({
  value,
  onChange,
  statuses = CHIP_STATUSES,
  anyLabel,
}: {
  value: string;
  onChange: (status: string) => void;
  statuses?: TaskStatus[];
  anyLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 slim-scroll sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0"
    >
      {anyLabel && (
        <Chip
          active={value === ''}
          onClick={() => onChange('')}
          className="bg-surface-sunken text-fg"
        >
          {anyLabel}
        </Chip>
      )}
      {statuses.map((s) => (
        <Chip
          key={s}
          active={value === s}
          onClick={() => onChange(value === s && !anyLabel ? '' : s)}
        >
          <StatusPill status={TASK_STATUSES[s]} />
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border border-transparent px-3 py-1 text-sm font-medium transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px active:scale-95 motion-reduce:transform-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
        active && 'border-border-strong shadow-sm',
      )}
    >
      {children}
    </button>
  );
}

export function TaskRow({ task, showProject = false }: { task: HrmsTask; showProject?: boolean }) {
  const done = task.status === 'done';
  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className="group flex items-center gap-3 rounded-control px-3 py-2 transition-colors duration-150 hover:bg-surface-sunken/70 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            done ? 'border-fg bg-fg text-bg' : 'border-border-strong group-hover:border-fg',
          )}
        >
          {done && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-fg-subtle')}>
          {task.title}
          {showProject && <span className="ml-2 text-xs text-fg-subtle">{task.projectName}</span>}
        </span>
        {!done && task.status !== 'todo' && (
          <StatusPill status={TASK_STATUSES[task.status]} className="hidden sm:inline-flex" />
        )}
        {task.assignees.length > 0 && (
          <AvatarStack people={task.assignees.map((a) => ({ name: a.fullName }))} max={2} />
        )}
      </Link>
    </li>
  );
}

export function ProjectCard({ project: p }: { project: HrmsProject }) {
  const { session } = useHrmsAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const canAddTask =
    session?.role === 'ceo' || session?.role === 'coo' || session?.role === 'manager';

  const tasks = useQuery({
    queryKey: ['hrms', 'tasks', session?.activeMemberId, 'project-card', p.id],
    queryFn: () => hrmsFetch<Paginated<HrmsTask>>(`/tasks?projectId=${p.id}&pageSize=100`),
    enabled: open && Boolean(session?.activeMemberId),
  });
  const shown = (tasks.data?.items ?? []).filter((t) => !status || t.status === status);
  const people = new Map<string, string>();
  tasks.data?.items.forEach((t) => t.assignees.forEach((a) => people.set(a.memberId, a.fullName)));

  return (
    <li className="rounded-[1.5rem] bg-surface-sunken p-1.5 transition-shadow duration-200 hover:shadow-float">
      <div className="rounded-card bg-surface-raised p-4">
        <div className="flex items-start gap-3">
          <ProgressRing done={p.progress.doneTasks} percent={p.progress.percentDone} />
          <div className="min-w-0 flex-1">
            <Link href={`/projects/${p.id}`} className="block truncate font-bold hover:underline">
              {p.name}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <ProjectStatusBadge status={p.status} />
              {p.dueDate && <span>Due {p.dueDate}</span>}
              {p.iAmLead && <Badge tone="primary">Lead</Badge>}
              <ProjectFlags flags={p.flags} />
            </div>
          </div>
          {people.size > 0 && (
            <AvatarStack people={[...people.values()].map((name) => ({ name }))} />
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Hide tasks of ${p.name}` : `Show tasks of ${p.name}`}
            onClick={() => setOpen((v) => !v)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-[background-color,transform] duration-150 hover:bg-surface-sunken active:scale-90 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                'size-5 transition-transform duration-300 ease-out',
                open && 'rotate-180',
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <StatusChips value={status} onChange={setStatus} />
              {tasks.isLoading && (
                <div className="space-y-2 px-3" aria-label="Loading project tasks">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              )}
              {tasks.error && (
                <ErrorState
                  title="Could not load tasks"
                  message="The project tasks could not be loaded."
                  onRetry={() => void tasks.refetch()}
                />
              )}
              {tasks.data && shown.length === 0 && (
                <EmptyState
                  title={tasks.data.items.length === 0 ? 'No tasks yet' : 'No matching tasks'}
                  description={
                    tasks.data.items.length === 0
                      ? 'Add a task to start tracking work on this project.'
                      : 'Try another status filter.'
                  }
                />
              )}
              <ul className="-mx-1">
                {shown.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-fg-muted">
        <span>
          {p.progress.percentDone === null
            ? 'No tasks yet'
            : `${p.progress.doneTasks} of ${p.progress.countedTasks} done`}
          {' · '}
          {p.managerCount + p.employeeCount}{' '}
          {p.managerCount + p.employeeCount === 1 ? 'person' : 'people'}
        </span>
        <span className="flex items-center gap-2">
          {canAddTask && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/tasks/new?projectId=${p.id}`}>
                <Plus aria-hidden className="size-4" />
                Add task
              </Link>
            </Button>
          )}
          <Link href={`/projects/${p.id}`} className="font-bold text-fg hover:underline">
            Open →
          </Link>
        </span>
      </div>
    </li>
  );
}
