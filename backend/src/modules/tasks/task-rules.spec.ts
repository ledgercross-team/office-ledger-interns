import {
  allowedActions,
  canApplyAction,
  commentRequired,
  denialFor,
  nextStatus,
  TASK_ACTIONS,
  type TaskAction,
  type TaskStatus,
} from './task-rules';

const STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'delayed',
  'done',
  'incomplete',
  'cancelled',
];

// Section 12, written out independently of the implementation.
const FROM: Record<TaskAction, TaskStatus[]> = {
  start: ['todo', 'delayed'],
  done: ['in_progress', 'delayed'],
  delayed: ['todo', 'in_progress'],
  incomplete: ['todo', 'in_progress', 'delayed'],
  reopen: ['done', 'incomplete'],
  cancel: ['todo', 'in_progress', 'delayed', 'incomplete'],
};
const TO: Record<TaskAction, TaskStatus> = {
  start: 'in_progress',
  done: 'done',
  delayed: 'delayed',
  incomplete: 'incomplete',
  reopen: 'in_progress',
  cancel: 'cancelled',
};
const MANAGER_ONLY: TaskAction[] = ['reopen', 'cancel'];
const COMMENT_REQUIRED: TaskAction[] = ['delayed', 'incomplete', 'reopen', 'cancel'];

// People relative to a task assigned to `assignee`.
const people = {
  admin: {
    actor: { id: 'a', role: 'admin' as const },
    assignee: 'e1',
    assigneeRole: 'employee' as const,
  },
  managerOverEmployee: {
    actor: { id: 'm1', role: 'manager' as const },
    assignee: 'e1',
    assigneeRole: 'employee' as const,
  },
  managerOwnTask: {
    actor: { id: 'm1', role: 'manager' as const },
    assignee: 'm1',
    assigneeRole: 'manager' as const,
  },
  managerOverManager: {
    actor: { id: 'm1', role: 'manager' as const },
    assignee: 'm2',
    assigneeRole: 'manager' as const,
  },
  assigneeEmployee: {
    actor: { id: 'e1', role: 'employee' as const },
    assignee: 'e1',
    assigneeRole: 'employee' as const,
  },
  otherEmployee: {
    actor: { id: 'e2', role: 'employee' as const },
    assignee: 'e1',
    assigneeRole: 'employee' as const,
  },
};

// Who may press each kind of button.
const CAN_ACT = {
  admin: true,
  managerOverEmployee: true,
  managerOwnTask: true, // assignee
  managerOverManager: false,
  assigneeEmployee: true,
  otherEmployee: false,
};
const CAN_MANAGE = {
  admin: true,
  managerOverEmployee: true,
  managerOwnTask: false, // a manager's own task has a manager assignee
  managerOverManager: false,
  assigneeEmployee: false,
  otherEmployee: false,
};

describe('task rules (section 12)', () => {
  describe('nextStatus / commentRequired', () => {
    it.each(TASK_ACTIONS)('%s', (action) => {
      expect(nextStatus(action)).toBe(TO[action]);
      expect(commentRequired(action)).toBe(COMMENT_REQUIRED.includes(action));
    });
  });

  describe('every action x status x person', () => {
    for (const action of TASK_ACTIONS) {
      for (const status of STATUSES) {
        for (const [name, p] of Object.entries(people) as [
          keyof typeof people,
          (typeof people)[keyof typeof people],
        ][]) {
          const statusOk = FROM[action].includes(status);
          const personOk = (MANAGER_ONLY.includes(action) ? CAN_MANAGE : CAN_ACT)[name];

          it(`${action} on ${status} by ${name}: ${statusOk && personOk ? 'allowed' : 'denied'}`, () => {
            const task = { status, assigneeId: p.assignee };
            expect(canApplyAction(p.actor, task, p.assigneeRole, action)).toBe(
              statusOk && personOk,
            );

            const expected = !personOk ? 'forbidden' : !statusOk ? 'invalid_status' : null;
            expect(denialFor(p.actor, task, p.assigneeRole, action)).toBe(expected);
          });
        }
      }
    }
  });

  describe('allowedActions', () => {
    it('lists what an employee may do on their in-progress task', () => {
      const p = people.assigneeEmployee;
      expect(
        allowedActions(p.actor, { status: 'in_progress', assigneeId: p.assignee }, p.assigneeRole),
      ).toEqual(['done', 'delayed', 'incomplete']);
    });

    it('lets an admin reopen a done task', () => {
      const p = people.admin;
      expect(
        allowedActions(p.actor, { status: 'done', assigneeId: p.assignee }, p.assigneeRole),
      ).toEqual(['reopen']);
    });

    it('gives another employee nothing', () => {
      const p = people.otherEmployee;
      expect(
        allowedActions(p.actor, { status: 'todo', assigneeId: p.assignee }, p.assigneeRole),
      ).toEqual([]);
    });
  });
});
