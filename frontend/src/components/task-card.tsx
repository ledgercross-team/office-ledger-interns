import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { Task } from '@/lib/types';
import { CategoryTag } from './category-tag';
import { StatusBadge } from './status-badge';
import { TaskActionBar } from './task-action-bar';

const PRIORITY_STYLES = {
  high: { label: 'High', className: 'bg-alert-tint text-alert-deep', dot: 'bg-alert' },
  medium: { label: 'Medium', className: 'bg-amber-tint text-amber-deep', dot: 'bg-brand-amber' },
  low: { label: 'Low', className: 'bg-mist text-forest', dot: 'bg-evergreen' },
} as const;

export function TaskCard({
  task,
  linkTitle = true,
  timezone,
}: {
  task: Task;
  linkTitle?: boolean;
  timezone?: string;
}) {
  const priority = PRIORITY_STYLES[task.priority];

  return (
    <article className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 font-semibold break-words text-charcoal">
          {linkTitle ? (
            <Link href={`/tasks/${task.id}`} className="text-evergreen hover:underline">
              {task.title}
            </Link>
          ) : (
            task.title
          )}
        </h2>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          <CategoryTag category={task.category} />
          {task.overdue && (
            <span className="rounded-full bg-alert px-2.5 py-0.5 text-xs font-medium text-white">
              Overdue
            </span>
          )}
          <StatusBadge status={task.status} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-y-1">
        <div className="flex min-w-0 flex-col items-start">
          <dt className="text-charcoal-soft">Assignee</dt>
          <dd className="mt-1">{task.assigneeName ?? '—'}</dd>
        </div>
        <div className="flex min-w-0 flex-col items-start">
          <dt className="text-charcoal-soft">Deadline</dt>
          <dd className="mt-1 break-words">{formatDateTime(task.deadline, timezone)}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="shrink-0 text-charcoal-soft">Priority</dt>
          <dd className="min-w-0">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${priority.className}`}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
          </dd>
        </div>
      </dl>
      <TaskActionBar task={task} />
    </article>
  );
}
