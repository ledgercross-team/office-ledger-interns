import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { Task } from '@/lib/types';
import { StatusBadge } from './status-badge';
import { TaskActionBar } from './task-action-bar';

export function TaskCard({ task, linkTitle = true }: { task: Task; linkTitle?: boolean }) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold">
          {linkTitle ? (
            <Link href={`/tasks/${task.id}`} className="hover:underline">
              {task.title}
            </Link>
          ) : (
            task.title
          )}
        </h2>
        <div className="flex items-center gap-2">
          {task.overdue && (
            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              Overdue
            </span>
          )}
          <StatusBadge status={task.status} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-neutral-500">Assignee</dt>
          <dd>{task.assigneeName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Deadline</dt>
          <dd>{formatDateTime(task.deadline)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Priority</dt>
          <dd className="capitalize">{task.priority}</dd>
        </div>
      </dl>
      <TaskActionBar task={task} />
    </article>
  );
}
