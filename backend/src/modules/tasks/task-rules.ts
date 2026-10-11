import type { Role } from '../../auth/auth.types';

export type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'done' | 'incomplete' | 'cancelled';
export type TaskAction = 'start' | 'done' | 'delayed' | 'incomplete' | 'reopen' | 'cancel';

export const TASK_ACTIONS: TaskAction[] = [
  'start',
  'done',
  'delayed',
  'incomplete',
  'reopen',
  'cancel',
];

interface ActionRule {
  from: TaskStatus[];
  to: TaskStatus;
  // true: only a task manager may press it; false: any task actor (assignee or task manager).
  managerOnly: boolean;
  commentRequired: boolean;
}

// Section 12. One row per button.
const RULES: Record<TaskAction, ActionRule> = {
  start: {
    from: ['todo', 'delayed'],
    to: 'in_progress',
    managerOnly: false,
    commentRequired: false,
  },
  done: {
    from: ['in_progress', 'delayed'],
    to: 'done',
    managerOnly: false,
    commentRequired: false,
  },
  delayed: {
    from: ['todo', 'in_progress'],
    to: 'delayed',
    managerOnly: false,
    commentRequired: true,
  },
  incomplete: {
    from: ['todo', 'in_progress', 'delayed'],
    to: 'incomplete',
    managerOnly: false,
    commentRequired: true,
  },
  reopen: {
    from: ['done', 'incomplete'],
    to: 'in_progress',
    managerOnly: true,
    commentRequired: true,
  },
  cancel: {
    from: ['todo', 'in_progress', 'delayed', 'incomplete'],
    to: 'cancelled',
    managerOnly: true,
    commentRequired: true,
  },
};

export interface TaskActor {
  id: string;
  role: Role;
}

export interface TaskForRules {
  status: TaskStatus;
  assigneeId: string;
}

// The company's admin, or a manager when the assignee is an employee.
export function isTaskManager(actor: TaskActor, assigneeRole: Role): boolean {
  return actor.role === 'admin' || (actor.role === 'manager' && assigneeRole === 'employee');
}

// The assignee or a task manager.
export function isTaskActor(actor: TaskActor, task: TaskForRules, assigneeRole: Role): boolean {
  return actor.id === task.assigneeId || isTaskManager(actor, assigneeRole);
}

export function nextStatus(action: TaskAction): TaskStatus {
  return RULES[action].to;
}

export function commentRequired(action: TaskAction): boolean {
  return RULES[action].commentRequired;
}

/** Why an action is refused: 'forbidden' (this person) or 'invalid_status' (this state). */
export function denialFor(
  actor: TaskActor,
  task: TaskForRules,
  assigneeRole: Role,
  action: TaskAction,
): 'forbidden' | 'invalid_status' | null {
  const rule = RULES[action];
  const permitted = rule.managerOnly
    ? isTaskManager(actor, assigneeRole)
    : isTaskActor(actor, task, assigneeRole);

  if (!permitted) return 'forbidden';
  if (!rule.from.includes(task.status)) return 'invalid_status';
  return null;
}

export function canApplyAction(
  actor: TaskActor,
  task: TaskForRules,
  assigneeRole: Role,
  action: TaskAction,
): boolean {
  return denialFor(actor, task, assigneeRole, action) === null;
}

export function allowedActions(
  actor: TaskActor,
  task: TaskForRules,
  assigneeRole: Role,
): TaskAction[] {
  return TASK_ACTIONS.filter((action) => canApplyAction(actor, task, assigneeRole, action));
}
