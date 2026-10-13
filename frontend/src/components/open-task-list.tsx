'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { TaskCard } from '@/components/task-card';
import { apiFetch } from '@/lib/api-client';
import { buildQuery, errorMessage } from '@/lib/format';
import type { Paginated, Task } from '@/lib/types';

const OPEN = ['todo', 'in_progress', 'delayed'];
const PAGE_SIZE_OPTIONS = [5, 10] as const;

// The API returns tasks sorted by priority, then deadline; keep that order and show only open ones.
export function OpenTaskList({ assigneeId, title }: { assigneeId?: string; title: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({
    queryKey: ['tasks', 'open', assigneeId ?? 'me'],
    queryFn: () =>
      apiFetch<Paginated<Task>>(`/tasks${buildQuery({ assigneeId, pageSize: 100 })}`),
  });

  const tasks = query.data?.items.filter((task) => OPEN.includes(task.status)) ?? [];
  const totalPages = Math.max(1, Math.ceil(tasks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleTasks = tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="font-semibold text-charcoal">{title}</h2>
      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && tasks.length === 0 && (
        <p className="text-sm text-charcoal-soft">No tasks assigned to you.</p>
      )}
      {visibleTasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
      {query.data && tasks.length > 0 && (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={tasks.length}
          onPage={setPage}
          onPageSize={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          pageSizeId={assigneeId ? 'my-open-tasks-page-size' : 'open-tasks-page-size'}
        />
      )}
    </section>
  );
}
