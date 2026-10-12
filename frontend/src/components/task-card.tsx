import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { Task } from '@/lib/types';
import { CategoryTag } from './category-tag';
import { StatusBadge } from './status-badge';
import { TaskActionBar } from './task-action-bar';

export function TaskCard({
  task,
  linkTitle = true,
  timezone,
}: {
  task: Task;
  linkTitle?: boolean;
  timezone?: string;
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-charcoal">
          {linkTitle ? (
            <Link href={`/tasks/${task.id}`} className="text-evergreen hover:underline">
              {task.title}
            </Link>
          ) : (
            task.title
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryTag category={task.category} />
          {task.overdue && (
            <span className="rounded-full bg-alert px-2.5 py-0.5 text-xs font-medium text-white">
              Overdue
            </span>
          )}
          <StatusBadge status={task.status} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-charcoal-soft">Assignee</dt>
          <dd>{task.assigneeName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-charcoal-soft">Deadline</dt>
          <dd>{formatDateTime(task.deadline, timezone)}</dd>
        </div>
        <div>
          <dt className="text-charcoal-soft">Priority</dt>
          <dd className="capitalize">{task.priority}</dd>
        </div>
      </dl>
      <TaskActionBar task={task} />
    </article>
  );
}
