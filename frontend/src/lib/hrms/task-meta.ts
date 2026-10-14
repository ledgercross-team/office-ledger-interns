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
  todo: 'bg-charcoal/10 text-charcoal',
  in_progress: 'bg-mist text-forest',
  in_review: 'bg-amber-tint text-amber-deep',
  done: 'bg-evergreen text-white',
  blocked: 'bg-alert-tint text-alert-deep',
  cancelled: 'bg-charcoal/10 text-charcoal-soft line-through',
};

export const TASK_URGENCY_STYLE: Record<TaskUrgency, string> = {
  high: 'bg-alert-tint text-alert-deep',
  medium: 'bg-amber-tint text-amber-deep',
  low: 'bg-mist text-forest',
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
