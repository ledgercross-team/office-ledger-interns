import { StatusPill } from '@/components/ui';
import { FLAGS, TASK_STATUSES, URGENCIES } from '@/lib/hrms/status-vocabulary';
import type { HrmsTask, TaskStatus, TaskUrgency } from '@/lib/hrms/types';

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <StatusPill status={TASK_STATUSES[status]} />;
}

export function UrgencyBadge({ urgency }: { urgency: TaskUrgency }) {
  return <StatusPill status={URGENCIES[urgency]} />;
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
      {flags.noAssignee && <StatusPill status={FLAGS.no_assignee} />}
      {!flags.noAssignee && flags.noManager && <StatusPill status={FLAGS.no_manager} />}
      {!flags.noAssignee && flags.noEmployee && <StatusPill status={FLAGS.no_employee} />}
      {flags.overdue && <StatusPill status={FLAGS.overdue} />}
    </span>
  );
}
