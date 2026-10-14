import {
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLE,
  TASK_URGENCY_LABELS,
  TASK_URGENCY_STYLE,
} from '@/lib/hrms/task-meta';
import type { HrmsTask, TaskStatus, TaskUrgency } from '@/lib/hrms/types';

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${TASK_STATUS_STYLE[status]}`}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: TaskUrgency }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${TASK_URGENCY_STYLE[urgency]}`}>
      {TASK_URGENCY_LABELS[urgency]}
    </span>
  );
}

// Plan sections 2 and 5: "No manager", "No employee", "No assignee" and overdue in red.
export function TaskFlags({ flags }: { flags: HrmsTask['flags'] }) {
  const chips: string[] = [];
  if (flags.noAssignee) chips.push('No assignee');
  else {
    if (flags.noManager) chips.push('No manager');
    if (flags.noEmployee) chips.push('No employee');
  }
  if (flags.overdue) chips.push('Overdue');
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-alert-tint px-2 py-0.5 text-xs text-alert-deep">
          {c}
        </span>
      ))}
    </span>
  );
}
