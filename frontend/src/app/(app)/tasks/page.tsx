'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { RoleGate } from '@/components/role-gate';
import { TaskCard } from '@/components/task-card';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage, formatDateTime } from '@/lib/format';
import { TASK_CATEGORIES } from '@/lib/task-meta';
import type { Paginated, Task, TaskAssignmentRequest, TaskStatus } from '@/lib/types';

const PAGE_SIZE_OPTIONS = [5, 10] as const;

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'done', label: 'Done' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'cancelled', label: 'Cancelled' },
];

function AssignmentApprovals() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['task-assignment-requests', 'pending'],
    queryFn: () =>
      apiFetch<Paginated<TaskAssignmentRequest>>(
        `/tasks/assignment-requests${buildQuery({ status: 'pending', pageSize: 100 })}`,
      ),
    refetchInterval: 30_000,
  });
  const review = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'approve' | 'reject' }) =>
      apiFetch(`/tasks/assignment-requests/${requestId}/${decision}`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-assignment-requests', 'pending'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-charcoal-soft">Loading assignment approvals…</p>;
  }
  if (query.error) {
    return <p role="alert" className="text-sm text-alert-deep">{errorMessage(query.error)}</p>;
  }
  if (!query.data || query.data.items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-brand-amber/40 bg-amber-tint/40 p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-deep">Admin notification</p>
        <h2 className="mt-1 text-lg font-semibold text-charcoal">Task assignment approvals ({query.data.total})</h2>
        <p className="mt-1 text-sm text-charcoal-soft">Managers are requesting access to employees outside their own teams.</p>
      </div>
      <div className="space-y-3">
        {query.data.items.map((request) => (
          <article key={request.id} className="rounded-xl border border-charcoal/10 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold break-words text-charcoal">{request.title}</h3>
                <p className="mt-1 text-sm text-charcoal-soft">
                  {request.managerName} wants to assign this task to {request.employeeName}.
                </p>
                <p className="mt-1 text-xs text-charcoal-soft">
                  {request.employeeManagerName
                    ? `Currently reports to ${request.employeeManagerName}.`
                    : 'The employee is currently unassigned.'}{' '}
                  Deadline: {formatDateTime(request.deadline)}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ requestId: request.id, decision: 'approve' })}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-evergreen px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:flex-none"
                >
                  Approve & create task
                </button>
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ requestId: request.id, decision: 'reject' })}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-alert/30 px-3 py-2 text-sm font-medium text-alert-deep hover:bg-alert-tint disabled:opacity-60 sm:flex-none"
                >
                  Reject
                </button>
              </div>
            </div>
            {review.error && (
              <p role="alert" className="mt-3 text-sm text-alert-deep">
                {errorMessage(review.error)}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskList() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useQuery({
    queryKey: ['tasks', 'list', { status, category, overdue, page, pageSize }],
    queryFn: () =>
      apiFetch<Paginated<Task>>(
        `/tasks${buildQuery({
          status,
          category,
          overdue: overdue || undefined,
          page,
          pageSize,
        })}`,
      ),
  });

  const canCreate = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5">
      {user?.role === 'admin' && <AssignmentApprovals />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-forest">
            <span className="h-1.5 w-1.5 rounded-full bg-evergreen" aria-hidden />
            Work queue
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">Taskboard</h1>
          <p className="mt-1 text-sm text-charcoal-soft">Review the most important work first, then move through the queue.</p>
        </div>
        {canCreate && (
          <Link href="/tasks/new" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-evergreen-dark sm:w-auto">
            New task
          </Link>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/10 pb-4">
          <div>
            <p className="text-sm font-semibold text-charcoal">Filter tasks</p>
            <p className="mt-0.5 text-xs text-charcoal-soft">Tasks are automatically sorted by priority.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-charcoal-soft">Priority:</span>
            <span className="rounded-full bg-alert-tint px-2.5 py-1 text-alert-deep">High</span>
            <span className="rounded-full bg-amber-tint px-2.5 py-1 text-amber-deep">Medium</span>
            <span className="rounded-full bg-mist px-2.5 py-1 text-forest">Low</span>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1 sm:w-auto">
            <label htmlFor="status" className="block text-sm font-medium text-charcoal">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen sm:w-auto"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full space-y-1 sm:w-auto">
            <label htmlFor="category" className="block text-sm font-medium text-charcoal">
              Type of work
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen sm:w-auto"
            >
              <option value="">All</option>
              {TASK_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => {
                setOverdue(event.target.checked);
                setPage(1);
              }}
            />
            Overdue only
          </label>
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No tasks found.</p>
      )}
      <div className="space-y-3">
        {query.data?.items.map((task) => (
          <TaskCard key={task.id} task={task} timezone={user?.companyTimezone} />
        ))}
      </div>
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPage={setPage}
          onPageSize={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          pageSizeId="tasks-page-size"
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <RoleGate allow={['admin', 'manager', 'employee']}>
      <TaskList />
    </RoleGate>
  );
}
