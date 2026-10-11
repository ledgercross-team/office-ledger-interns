import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['game_master', 'admin', 'manager', 'employee']);

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'delayed',
  'done',
  'incomplete',
  'cancelled',
]);

export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);

export const taskActivityTypeEnum = pgEnum('task_activity_type', ['comment', 'status_change']);

export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'late']);
