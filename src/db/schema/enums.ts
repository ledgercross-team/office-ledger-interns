import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("member_role", ["owner", "manager", "employee"]);
export const memberStatusEnum = pgEnum("member_status", ["pending", "active", "rejected", "deactivated"]);
export const themeEnum = pgEnum("theme_mode", ["light", "dark", "system"]);
export const approvalModeEnum = pgEnum("approval_mode", ["none", "late", "remote", "both"]);
export const workModeEnum = pgEnum("work_mode", ["office", "remote"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "late",
  "remote",
  "half_day",
  "absent",
  "on_leave",
]);
export const approvalStateEnum = pgEnum("approval_state", ["not_required", "pending", "approved", "rejected"]);
export const attendanceSourceEnum = pgEnum("attendance_source", ["self", "manager", "auto", "correction", "leave", "seed"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected", "cancelled"]);
export const leaveKindEnum = pgEnum("leave_kind", ["full_day", "half_day"]);
export const halfEnum = pgEnum("day_half", ["first", "second"]);
export const accrualEnum = pgEnum("leave_accrual", ["yearly", "monthly"]);
export const holidayStatusEnum = pgEnum("holiday_status", ["proposed", "active", "rejected"]);
export const holidaySourceEnum = pgEnum("holiday_source", ["manual", "import"]);
export const rsvpEnum = pgEnum("rsvp_state", ["pending", "yes", "no", "maybe"]);
export const recurrenceEnum = pgEnum("recurrence", ["none", "daily", "weekly", "monthly"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "blocked", "done"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["new", "reviewing", "resolved"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const complaintEventEnum = pgEnum("complaint_event_kind", [
  "created",
  "status_change",
  "note",
  "resolution",
  "assigned",
]);
export const exceptionKindEnum = pgEnum("exception_kind", ["missing_checkout", "absent", "overtime", "anomaly"]);
