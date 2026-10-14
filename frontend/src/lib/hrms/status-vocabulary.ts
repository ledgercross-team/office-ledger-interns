import {
  AlertTriangle, Archive, Ban, CalendarCheck, CalendarDays, Check, CheckCircle2,
  Circle, CircleAlert, Clock3, Coffee, Flag, Gauge, PauseCircle, ShieldAlert,
  Sparkles, TimerOff, UserMinus, Users, XCircle, type LucideIcon,
} from 'lucide-react';

export type SemanticTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export interface StatusDefinition { label: string; tone: SemanticTone; icon: LucideIcon; strike?: boolean }

export const TASK_STATUSES = {
  todo: { label: 'To do', tone: 'neutral', icon: Circle },
  in_progress: { label: 'In progress', tone: 'info', icon: Clock3 },
  in_review: { label: 'In review', tone: 'primary', icon: CircleAlert },
  done: { label: 'Done', tone: 'success', icon: CheckCircle2 },
  blocked: { label: 'Blocked', tone: 'danger', icon: Ban },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: XCircle, strike: true },
} satisfies Record<string, StatusDefinition>;
export const LEGACY_TASK_STATUSES = {
  todo: TASK_STATUSES.todo,
  in_progress: TASK_STATUSES.in_progress,
  delayed: { label: 'Delayed', tone: 'warning', icon: Clock3 },
  done: TASK_STATUSES.done,
  incomplete: { label: 'Incomplete', tone: 'danger', icon: CircleAlert },
  cancelled: TASK_STATUSES.cancelled,
} satisfies Record<string, StatusDefinition>;
export const URGENCIES = {
  high: { label: 'High', tone: 'danger', icon: AlertTriangle },
  medium: { label: 'Medium', tone: 'warning', icon: Flag },
  low: { label: 'Low', tone: 'neutral', icon: Flag },
} satisfies Record<string, StatusDefinition>;
export const REQUEST_STATUSES = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock3 },
  approved: { label: 'Approved', tone: 'info', icon: Check },
  applied: { label: 'Applied', tone: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'danger', icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
  expired: { label: 'Expired', tone: 'neutral', icon: TimerOff },
} satisfies Record<string, StatusDefinition>;
export const PROJECT_STATUSES = {
  active: { label: 'Active', tone: 'info', icon: Circle },
  pending_lead_approval: { label: 'Pending lead approval', tone: 'warning', icon: Clock3 },
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  archived: { label: 'Archived', tone: 'neutral', icon: Archive },
} satisfies Record<string, StatusDefinition>;
export const ATTENDANCE_STATUSES = {
  present: { label: 'Present', tone: 'success', icon: CheckCircle2 },
  late: { label: 'Late', tone: 'warning', icon: Clock3 },
  missing_checkout: { label: 'Missing check-out', tone: 'warning', icon: TimerOff },
  on_leave: { label: 'On leave', tone: 'info', icon: Coffee },
  holiday: { label: 'Holiday', tone: 'neutral', icon: CalendarCheck },
  weekend: { label: 'Weekend', tone: 'neutral', icon: CalendarDays },
  absent: { label: 'Absent', tone: 'danger', icon: UserMinus },
} satisfies Record<string, StatusDefinition>;
export const WORKLOADS = {
  green: { label: 'Healthy workload', tone: 'success', icon: Gauge },
  amber: { label: 'Busy', tone: 'warning', icon: Gauge },
  red: { label: 'Overloaded', tone: 'danger', icon: Gauge },
} satisfies Record<string, StatusDefinition>;
export const PERFORMANCE_BANDS = {
  excellent: { label: 'Excellent', tone: 'success', icon: Sparkles },
  good: { label: 'Good', tone: 'info', icon: CheckCircle2 },
  needs_attention: { label: 'Needs attention', tone: 'warning', icon: AlertTriangle },
  poor: { label: 'Poor', tone: 'danger', icon: ShieldAlert },
  new: { label: 'New', tone: 'neutral', icon: Sparkles },
  no_ratings: { label: 'No ratings yet', tone: 'neutral', icon: Users },
} satisfies Record<string, StatusDefinition>;
export const ORG_STATUSES = {
  active: { label: 'Active', tone: 'success', icon: CheckCircle2 },
  grace: { label: 'Grace period', tone: 'warning', icon: Clock3 },
  read_only: { label: 'Read-only', tone: 'warning', icon: PauseCircle },
  suspended: { label: 'Suspended', tone: 'danger', icon: Ban },
  blocked: { label: 'Blocked', tone: 'danger', icon: ShieldAlert },
} satisfies Record<string, StatusDefinition>;
export const FLAGS = {
  no_manager: { label: 'No manager', tone: 'danger', icon: UserMinus },
  no_employee: { label: 'No employee', tone: 'danger', icon: UserMinus },
  no_assignee: { label: 'No assignee', tone: 'warning', icon: UserMinus },
  overdue: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
} satisfies Record<string, StatusDefinition>;
