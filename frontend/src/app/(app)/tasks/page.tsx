'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { RoleGate } from '@/components/role-gate';
import { TaskCard } from '@/components/task-card';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage } from '@/lib/format';
import type { Paginated, Task, TaskStatus } from '@/lib/types';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'done', label: 'Done' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'cancelled', label: 'Cancelled' },
];

function TaskList() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['tasks', 'list', { status, overdue, page }],
    queryFn: () =>
      apiFetch<Paginated<Task>>(
        `/tasks${buildQuery({ status, overdue: overdue || undefined, page, pageSize: PAGE_SIZE })}`,
      ),
  });

  const canCreate = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-charcoal">Tasks</h1>
        {canCreate && (
          <Link href="/tasks/new" className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-evergreen-dark">
            New task
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <div className="space-y-1">
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
            className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
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
        {query.data?.items.map((task) => <TaskCard key={task.id} task={task} />)}
      </div>
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPage={setPage}
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
