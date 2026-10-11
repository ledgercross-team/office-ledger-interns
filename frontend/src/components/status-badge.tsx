import type { TaskStatus } from '@/lib/types';

const STYLES: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: 'To do', className: 'bg-charcoal/10 text-charcoal' },
  in_progress: { label: 'In progress', className: 'bg-mist text-forest' },
  delayed: { label: 'Delayed', className: 'bg-amber-tint text-amber-deep' },
  done: { label: 'Done', className: 'bg-forest text-white' },
  incomplete: { label: 'Incomplete', className: 'bg-alert-tint text-alert-deep' },
  cancelled: { label: 'Cancelled', className: 'bg-charcoal/5 text-charcoal-soft line-through' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className } = STYLES[status];

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
