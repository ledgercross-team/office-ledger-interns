'use client';

import { useQuery } from '@tanstack/react-query';
import { TaskCard } from '@/components/task-card';
import { apiFetch } from '@/lib/api-client';
import { buildQuery, errorMessage } from '@/lib/format';
import type { Paginated, Task } from '@/lib/types';

const OPEN = ['todo', 'in_progress', 'delayed'];

// The API returns tasks sorted by deadline; keep that order and show only open ones.
export function OpenTaskList({ assigneeId, title }: { assigneeId?: string; title: string }) {
  const query = useQuery({
    queryKey: ['tasks', 'open', assigneeId ?? 'me'],
    queryFn: () =>
      apiFetch<Paginated<Task>>(`/tasks${buildQuery({ assigneeId, pageSize: 100 })}`),
  });

  const tasks = query.data?.items.filter((task) => OPEN.includes(task.status)) ?? [];

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
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </section>
  );
}
