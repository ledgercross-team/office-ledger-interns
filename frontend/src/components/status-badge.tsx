import type { TaskStatus } from '@/lib/types';

const STYLES: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: 'To do', className: 'bg-gray-200 text-gray-800' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800' },
  delayed: { label: 'Delayed', className: 'bg-amber-100 text-amber-900' },
  done: { label: 'Done', className: 'bg-green-100 text-green-800' },
  incomplete: { label: 'Incomplete', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500 line-through' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className } = STYLES[status];

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
