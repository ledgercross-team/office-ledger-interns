import type { TaskStatus, TaskUrgency } from './types';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

export const TASK_URGENCY_LABELS: Record<TaskUrgency, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'bg-surface-sunken text-fg',
  in_progress: 'bg-warning-soft text-warning-fg',
  in_review: 'bg-info-soft text-info-fg',
  done: 'bg-success-soft text-success-fg',
  blocked: 'bg-danger-soft text-danger-fg',
  cancelled: 'bg-surface-sunken text-fg-muted line-through',
};

export const TASK_URGENCY_STYLE: Record<TaskUrgency, string> = {
  high: 'bg-danger-soft text-danger-fg',
  medium: 'bg-warning-soft text-warning-fg',
  low: 'bg-primary-soft text-primary',
};

export interface TaskAction {
  to: TaskStatus;
  label: string;
  /** What the person must write: a comment (send back, reopen) or a reason (block, cancel). */
  needs: 'comment' | 'reason' | null;
}

// Which buttons to offer from each status (plan section 5). This is only a hint for the
// screen: the database decides who may use each one and says why when it refuses.
const ACTIONS: Record<TaskStatus, TaskAction[]> = {
  todo: [
    { to: 'in_progress', label: 'Start', needs: null },
    { to: 'blocked', label: 'Block', needs: 'reason' },
    { to: 'cancelled', label: 'Cancel task', needs: 'reason' },
  ],
  in_progress: [
    { to: 'in_review', label: 'Send for review', needs: null },
    { to: 'blocked', label: 'Block', needs: 'reason' },
    { to: 'cancelled', label: 'Cancel task', needs: 'reason' },
  ],
  in_review: [
    { to: 'done', label: 'Mark done', needs: null },
    { to: 'in_progress', label: 'Send back', needs: 'comment' },
    { to: 'blocked', label: 'Block', needs: 'reason' },
    { to: 'cancelled', label: 'Cancel task', needs: 'reason' },
  ],
  blocked: [
    { to: 'in_progress', label: 'Unblock', needs: null },
    { to: 'cancelled', label: 'Cancel task', needs: 'reason' },
  ],
  done: [{ to: 'in_progress', label: 'Reopen', needs: 'comment' }],
  cancelled: [],
};

export function actionsFrom(status: TaskStatus): TaskAction[] {
  return ACTIONS[status];
}
