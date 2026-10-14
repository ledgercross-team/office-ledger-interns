// Pulled from the database. Foreign keys are not declared here: the database owns them.
import { pgSchema, check, uuid, timestamp, text, boolean, integer, pgPolicy, time, smallint, numeric, index, date, uniqueIndex, bigserial, jsonb, inet, cidr, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { customType } from "drizzle-orm/pg-core"

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const hrms = pgSchema("hrms");
export const attendanceStatusInHrms = hrms.enum("attendance_status", ['present', 'late', 'absent', 'on_leave', 'holiday', 'weekend'])
export const gmStatusInHrms = hrms.enum("gm_status", ['pending_confirmation', 'active', 'removed'])
export const inviteStatusInHrms = hrms.enum("invite_status", ['pending', 'accepted', 'declined', 'decline_accepted', 'overruled', 'expired'])
export const memberRoleInHrms = hrms.enum("member_role", ['ceo', 'coo', 'manager', 'employee'])
export const memberStatusInHrms = hrms.enum("member_status", ['active', 'suspended', 'deactivated'])
export const orgStatusInHrms = hrms.enum("org_status", ['active', 'grace', 'read_only', 'suspended', 'blocked'])
export const performanceBandInHrms = hrms.enum("performance_band", ['excellent', 'good', 'needs_attention', 'poor'])
export const platformReqStatusInHrms = hrms.enum("platform_req_status", ['pending', 'verified', 'completed', 'rejected'])
export const platformReqTypeInHrms = hrms.enum("platform_req_type", ['ceo_recovery', 'remove_last_ceo'])
export const projectRoleInHrms = hrms.enum("project_role", ['manager', 'employee'])
export const projectStatusInHrms = hrms.enum("project_status", ['active', 'pending_lead_approval', 'completed', 'archived'])
export const requestStatusInHrms = hrms.enum("request_status", ['pending', 'approved', 'applied', 'rejected', 'cancelled', 'expired'])
export const requestTypeInHrms = hrms.enum("request_type", ['create_user', 'create_project', 'add_to_project', 'create_task', 'assign_task', 'add_and_assign', 'leave', 'leave_change', 'attendance_correction'])
export const rsvpStatusInHrms = hrms.enum("rsvp_status", ['pending', 'accepted', 'declined'])
export const taskStatusInHrms = hrms.enum("task_status", ['todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'])
export const taskUrgencyInHrms = hrms.enum("task_urgency", ['high', 'medium', 'low'])


export const usersInHrms = hrms.table("users", {
	id: uuid().defaultRandom().notNull(),
	email: citext("email").notNull(),
	emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: 'string' }),
	passwordHash: text("password_hash").notNull(),
	fullName: text("full_name").notNull(),
	phone: text(),
	timezone: text().default('UTC').notNull(),
	mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
	mfaSecretEnc: bytea("mfa_secret_enc"),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	check("users_check", sql`(NOT mfa_enabled) OR (mfa_secret_enc IS NOT NULL)`),
	check("users_full_name_check", sql`length(TRIM(BOTH FROM full_name)) > 0`),
]);

export const gameMastersInHrms = hrms.table("game_masters", {
	userId: uuid("user_id").notNull(),
	status: gmStatusInHrms().default('pending_confirmation').notNull(),
	createdBy: uuid("created_by"),
	confirmedBy: uuid("confirmed_by"),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	removedAt: timestamp("removed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	check("game_masters_check", sql`(confirmed_by IS NULL) OR (confirmed_by <> created_by)`),
	check("game_masters_check1", sql`(confirmed_by IS NULL) OR (confirmed_by <> user_id)`),
	check("game_masters_check2", sql`(status <> 'active'::gm_status) OR (created_by IS NULL) OR (confirmed_by IS NOT NULL)`),
	check("game_masters_check3", sql`(status = 'removed'::gm_status) = (removed_at IS NOT NULL)`),
]);

export const plansInHrms = hrms.table("plans", {
	code: text().notNull(),
	name: text().notNull(),
	seatLimit: integer("seat_limit").notNull(),
}, () => [
	check("plans_seat_limit_check", sql`seat_limit > 0`),
]);

export const orgSettingsInHrms = hrms.table("org_settings", {
	orgId: uuid("org_id").notNull(),
	timezone: text().default('UTC').notNull(),
	workStartTime: time("work_start_time").default('09:00:00').notNull(),
	lateGraceMinutes: integer("late_grace_minutes").default(15).notNull(),
	weekendDays: smallint("weekend_days").array().default([6, 7]).notNull(),
	requestExpiryWorkingDays: integer("request_expiry_working_days").default(3).notNull(),
	workloadAmberTasks: integer("workload_amber_tasks").default(6).notNull(),
	workloadAmberProjects: integer("workload_amber_projects").default(3).notNull(),
	workloadRedTasks: integer("workload_red_tasks").default(10).notNull(),
	workloadRedProjects: integer("workload_red_projects").default(5).notNull(),
	weightAttendance: integer("weight_attendance").default(30).notNull(),
	weightRating: integer("weight_rating").default(50).notNull(),
	weightOntime: integer("weight_ontime").default(20).notNull(),
	pointsLate: numeric("points_late", { precision: 3, scale:  2 }).default('0.50').notNull(),
	pointsMissingCheckout: numeric("points_missing_checkout", { precision: 3, scale:  2 }).default('0.75').notNull(),
	pointsUnpaidLeave: numeric("points_unpaid_leave", { precision: 3, scale:  2 }).default('0.50').notNull(),
	ratingMinCount: integer("rating_min_count").default(3).notNull(),
	ratingPriorWeight: integer("rating_prior_weight").default(3).notNull(),
	ratingWindowDays: integer("rating_window_days").default(7).notNull(),
	highUrgencyReminderHours: integer("high_urgency_reminder_hours").default(24).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("org_settings_check", sql`(workload_red_tasks > workload_amber_tasks) AND (workload_red_projects > workload_amber_projects)`),
	check("org_settings_check1", sql`(weight_attendance >= 0) AND (weight_rating >= 0) AND (weight_ontime >= 0) AND (((weight_attendance + weight_rating) + weight_ontime) = 100)`),
	check("org_settings_late_grace_minutes_check", sql`(late_grace_minutes >= 0) AND (late_grace_minutes <= 240)`),
	check("org_settings_points_late_check", sql`(points_late >= (0)::numeric) AND (points_late <= (1)::numeric)`),
	check("org_settings_points_missing_checkout_check", sql`(points_missing_checkout >= (0)::numeric) AND (points_missing_checkout <= (1)::numeric)`),
	check("org_settings_points_unpaid_leave_check", sql`(points_unpaid_leave >= (0)::numeric) AND (points_unpaid_leave <= (1)::numeric)`),
	check("org_settings_rating_min_count_check", sql`rating_min_count >= 1`),
	check("org_settings_rating_prior_weight_check", sql`rating_prior_weight >= 0`),
	check("org_settings_rating_window_days_check", sql`rating_window_days > 0`),
	check("org_settings_request_expiry_working_days_check", sql`request_expiry_working_days > 0`),
	check("org_settings_weekend_days_check", sql`weekend_days <@ '{1,2,3,4,5,6,7}'::smallint[]`),
]);

export const subscriptionsInHrms = hrms.table("subscriptions", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	planCode: text("plan_code").notNull(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }).notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }).notNull(),
	paymentStatus: text("payment_status").notNull(),
	externalRef: text("external_ref"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("subscriptions_check", sql`current_period_end > current_period_start`),
	check("subscriptions_payment_status_check", sql`payment_status = ANY (ARRAY['paid'::text, 'failed'::text, 'refunded'::text, 'pending'::text])`),
]);

export const orgMembersInHrms = hrms.table("org_members", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: memberRoleInHrms().notNull(),
	status: memberStatusInHrms().default('active').notNull(),
	taskApprovalRequired: boolean("task_approval_required").default(false).notNull(),
	canViewAllProjects: boolean("can_view_all_projects").default(false).notNull(),
	designation: text(),
	department: text(),
	employeeCode: text("employee_code"),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: 'string' }),
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: 'string' }),
	deactivatedBy: uuid("deactivated_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("org_members_org_role_idx").using("btree", table.orgId.asc().nullsLast().op("uuid_ops"), table.role.asc().nullsLast().op("enum_ops")).where(sql`(status = 'active'::member_status)`),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("org_members_check", sql`(role = 'manager'::member_role) OR ((task_approval_required = false) AND (can_view_all_projects = false))`),
	check("org_members_check1", sql`(status = 'deactivated'::member_status) = (deactivated_at IS NOT NULL)`),
	check("org_members_check2", sql`(status = 'suspended'::member_status) = (suspended_at IS NOT NULL)`),
]);

export const projectsInHrms = hrms.table("projects", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	name: text().notNull(),
	description: text(),
	status: projectStatusInHrms().default('active').notNull(),
	startDate: date("start_date"),
	dueDate: date("due_date"),
	createdBy: uuid("created_by").notNull(),
	createdViaRequest: uuid("created_via_request"),
	completionRequestedAt: timestamp("completion_requested_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	completionApprovedBy: uuid("completion_approved_by"),
	ratingClosesAt: timestamp("rating_closes_at", { withTimezone: true, mode: 'string' }),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	archivedBy: uuid("archived_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("projects_check", sql`(due_date IS NULL) OR (start_date IS NULL) OR (due_date >= start_date)`),
	check("projects_check1", sql`(status <> 'pending_lead_approval'::project_status) OR (completion_requested_at IS NOT NULL)`),
	check("projects_check2", sql`(status <> 'completed'::project_status) OR ((completed_at IS NOT NULL) AND (completion_approved_by IS NOT NULL) AND (rating_closes_at IS NOT NULL))`),
	check("projects_check3", sql`(status = 'archived'::project_status) = ((archived_at IS NOT NULL) AND (archived_by IS NOT NULL))`),
	check("projects_name_check", sql`length(TRIM(BOTH FROM name)) > 0`),
]);

export const projectMembersInHrms = hrms.table("project_members", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	projectId: uuid("project_id").notNull(),
	memberId: uuid("member_id").notNull(),
	role: projectRoleInHrms().notNull(),
	isLead: boolean("is_lead").default(false).notNull(),
	leadTaggedBy: uuid("lead_tagged_by"),
	addedBy: uuid("added_by"),
	addedViaInvite: uuid("added_via_invite"),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	removedAt: timestamp("removed_at", { withTimezone: true, mode: 'string' }),
	removedBy: uuid("removed_by"),
}, (table) => [
	uniqueIndex("project_members_active_uq").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.memberId.asc().nullsLast().op("uuid_ops")).where(sql`(removed_at IS NULL)`),
	index("project_members_member_idx").using("btree", table.memberId.asc().nullsLast().op("uuid_ops")).where(sql`(removed_at IS NULL)`),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("project_members_check", sql`(NOT is_lead) OR (role = 'manager'::project_role)`),
	check("project_members_check1", sql`(NOT is_lead) OR (lead_tagged_by IS NOT NULL)`),
	check("project_members_check2", sql`(removed_at IS NULL) OR (NOT is_lead)`),
]);

export const tasksInHrms = hrms.table("tasks", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	projectId: uuid("project_id").notNull(),
	title: text().notNull(),
	description: text(),
	status: taskStatusInHrms().default('todo').notNull(),
	urgency: taskUrgencyInHrms().notNull(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }).notNull(),
	statusComment: text("status_comment"),
	blockedReason: text("blocked_reason"),
	cancelReason: text("cancel_reason"),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by").notNull(),
	createdViaRequest: uuid("created_via_request"),
	highReminderSentAt: timestamp("high_reminder_sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tasks_due_idx").using("btree", table.orgId.asc().nullsLast().op("timestamptz_ops"), table.dueAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status <> ALL (ARRAY['done'::task_status, 'cancelled'::task_status]))`),
	index("tasks_project_idx").using("btree", table.projectId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("tasks_check", sql`(status <> 'blocked'::task_status) OR (blocked_reason IS NOT NULL)`),
	check("tasks_check1", sql`(status <> 'cancelled'::task_status) OR (cancel_reason IS NOT NULL)`),
	check("tasks_check2", sql`(status = 'done'::task_status) = (completed_at IS NOT NULL)`),
	check("tasks_title_check", sql`length(TRIM(BOTH FROM title)) > 0`),
]);

export const taskAssigneesInHrms = hrms.table("task_assignees", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	taskId: uuid("task_id").notNull(),
	memberId: uuid("member_id").notNull(),
	role: projectRoleInHrms().notNull(),
	assignedBy: uuid("assigned_by"),
	assignedViaRequest: uuid("assigned_via_request"),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	removedAt: timestamp("removed_at", { withTimezone: true, mode: 'string' }),
	removedBy: uuid("removed_by"),
}, (table) => [
	uniqueIndex("task_assignees_active_uq").using("btree", table.taskId.asc().nullsLast().op("uuid_ops"), table.memberId.asc().nullsLast().op("uuid_ops")).where(sql`(removed_at IS NULL)`),
	index("task_assignees_member_idx").using("btree", table.memberId.asc().nullsLast().op("uuid_ops")).where(sql`(removed_at IS NULL)`),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const taskStatusHistoryInHrms = hrms.table("task_status_history", {
	id: bigserial({ mode: "bigint" }).notNull(),
	orgId: uuid("org_id").notNull(),
	taskId: uuid("task_id").notNull(),
	fromStatus: taskStatusInHrms("from_status"),
	toStatus: taskStatusInHrms("to_status").notNull(),
	comment: text(),
	changedBy: uuid("changed_by"),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const requestsInHrms = hrms.table("requests", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	type: requestTypeInHrms().notNull(),
	status: requestStatusInHrms().default('pending').notNull(),
	requestedBy: uuid("requested_by").notNull(),
	projectId: uuid("project_id"),
	subjectMemberId: uuid("subject_member_id"),
	taskId: uuid("task_id"),
	payload: jsonb().default({}).notNull(),
	reason: text(),
	dedupeKey: text("dedupe_key"),
	decidedBy: uuid("decided_by"),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decisionReason: text("decision_reason"),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("requests_dedupe_uq").using("btree", table.orgId.asc().nullsLast().op("text_ops"), table.dedupeKey.asc().nullsLast().op("text_ops")).where(sql`((status = 'pending'::request_status) AND (dedupe_key IS NOT NULL))`),
	index("requests_queue_idx").using("btree", table.orgId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("enum_ops"), table.type.asc().nullsLast().op("enum_ops"), table.projectId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("requests_check", sql`(status <> ALL (ARRAY['approved'::request_status, 'applied'::request_status, 'rejected'::request_status])) OR ((decided_by IS NOT NULL) AND (decided_at IS NOT NULL))`),
	check("requests_check1", sql`(status <> 'rejected'::request_status) OR (length(TRIM(BOTH FROM COALESCE(decision_reason, ''::text))) > 0)`),
	check("requests_check2", sql`(status <> 'applied'::request_status) OR (applied_at IS NOT NULL)`),
	check("requests_check3", sql`(type <> ALL (ARRAY['add_to_project'::request_type, 'create_task'::request_type, 'assign_task'::request_type, 'add_and_assign'::request_type])) OR (project_id IS NOT NULL)`),
	check("requests_check4", sql`(type <> ALL (ARRAY['add_to_project'::request_type, 'add_and_assign'::request_type, 'assign_task'::request_type])) OR (subject_member_id IS NOT NULL)`),
	check("requests_check5", sql`(type <> ALL (ARRAY['assign_task'::request_type, 'add_and_assign'::request_type])) OR (task_id IS NOT NULL)`),
	check("requests_check6", sql`(type <> 'create_user'::request_type) OR ((payload ? 'email'::text) AND (payload ? 'full_name'::text) AND ((payload ->> 'role'::text) = ANY (ARRAY['manager'::text, 'employee'::text])))`),
	check("requests_check7", sql`(type <> 'create_project'::request_type) OR (payload ? 'name'::text)`),
]);

export const projectInvitesInHrms = hrms.table("project_invites", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	projectId: uuid("project_id").notNull(),
	inviteeMemberId: uuid("invitee_member_id").notNull(),
	role: projectRoleInHrms().notNull(),
	invitedBy: uuid("invited_by").notNull(),
	requestId: uuid("request_id"),
	status: inviteStatusInHrms().default('pending').notNull(),
	declineReason: text("decline_reason"),
	reviewReason: text("review_reason"),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("project_invites_pending_uq").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.inviteeMemberId.asc().nullsLast().op("uuid_ops")).where(sql`(status = ANY (ARRAY['pending'::invite_status, 'declined'::invite_status]))`),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("project_invites_check", sql`invitee_member_id <> invited_by`),
	check("project_invites_check1", sql`(status <> ALL (ARRAY['declined'::invite_status, 'decline_accepted'::invite_status, 'overruled'::invite_status])) OR (length(TRIM(BOTH FROM COALESCE(decline_reason, ''::text))) > 0)`),
	check("project_invites_check2", sql`(status <> 'overruled'::invite_status) OR (length(TRIM(BOTH FROM COALESCE(review_reason, ''::text))) > 0)`),
]);

export const meetingsInHrms = hrms.table("meetings", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	title: text().notNull(),
	description: text(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	meetingLink: text("meeting_link"),
	location: text(),
	projectId: uuid("project_id"),
	createdBy: uuid("created_by").notNull(),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("meetings_check", sql`ends_at > starts_at`),
	check("meetings_check1", sql`num_nonnulls(meeting_link, location) = 1`),
	check("meetings_location_check", sql`(location IS NULL) OR (length(TRIM(BOTH FROM location)) > 0)`),
	check("meetings_meeting_link_check", sql`(meeting_link IS NULL) OR (meeting_link ~* '^https?://[^\s]+$'::text)`),
	check("meetings_title_check", sql`length(TRIM(BOTH FROM title)) > 0`),
]);

export const leaveTypesInHrms = hrms.table("leave_types", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	yearlyAllowanceDays: numeric("yearly_allowance_days", { precision: 5, scale:  1 }).notNull(),
	isPaid: boolean("is_paid").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("leave_types_yearly_allowance_days_check", sql`yearly_allowance_days >= (0)::numeric`),
]);

export const leaveRequestsInHrms = hrms.table("leave_requests", {
	requestId: uuid("request_id").notNull(),
	orgId: uuid("org_id").notNull(),
	memberId: uuid("member_id").notNull(),
	leaveTypeId: uuid("leave_type_id").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	startHalfDay: boolean("start_half_day").default(false).notNull(),
	endHalfDay: boolean("end_half_day").default(false).notNull(),
	days: numeric({ precision: 5, scale:  1 }).notNull(),
	reason: text().notNull(),
	overAllowance: boolean("over_allowance").default(false).notNull(),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("leave_requests_member_idx").using("btree", table.memberId.asc().nullsLast().op("uuid_ops"), table.startDate.asc().nullsLast().op("uuid_ops"), table.endDate.asc().nullsLast().op("uuid_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("leave_requests_check", sql`end_date >= start_date`),
	check("leave_requests_check1", sql`NOT ((start_date = end_date) AND start_half_day AND end_half_day)`),
	check("leave_requests_days_check", sql`days > (0)::numeric`),
	check("leave_requests_reason_check", sql`length(TRIM(BOTH FROM reason)) > 0`),
]);

export const attendanceDaysInHrms = hrms.table("attendance_days", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	memberId: uuid("member_id").notNull(),
	workDate: date("work_date").notNull(),
	status: attendanceStatusInHrms().notNull(),
	checkInAt: timestamp("check_in_at", { withTimezone: true, mode: 'string' }),
	checkInIp: inet("check_in_ip"),
	checkOutAt: timestamp("check_out_at", { withTimezone: true, mode: 'string' }),
	checkOutIp: inet("check_out_ip"),
	autoCheckedOut: boolean("auto_checked_out").default(false).notNull(),
	workedMinutes: integer("worked_minutes").generatedAlwaysAs(sql`((EXTRACT(epoch FROM (check_out_at - check_in_at)) / (60)::numeric))::integer`),
	leaveRequestId: uuid("leave_request_id"),
	correctedByRequest: uuid("corrected_by_request"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("attendance_days_check", sql`(status <> ALL (ARRAY['present'::attendance_status, 'late'::attendance_status])) OR ((check_in_at IS NOT NULL) AND (check_in_ip IS NOT NULL))`),
	check("attendance_days_check1", sql`(check_out_at IS NULL) OR (check_out_at > check_in_at)`),
	check("attendance_days_check2", sql`(NOT auto_checked_out) OR (check_out_at IS NOT NULL)`),
	check("attendance_days_check3", sql`(status <> 'on_leave'::attendance_status) OR (leave_request_id IS NOT NULL)`),
]);

export const attendanceCorrectionsInHrms = hrms.table("attendance_corrections", {
	requestId: uuid("request_id").notNull(),
	orgId: uuid("org_id").notNull(),
	memberId: uuid("member_id").notNull(),
	workDate: date("work_date").notNull(),
	attendanceDayId: uuid("attendance_day_id"),
	requestedCheckIn: timestamp("requested_check_in", { withTimezone: true, mode: 'string' }),
	requestedCheckOut: timestamp("requested_check_out", { withTimezone: true, mode: 'string' }),
	reason: text().notNull(),
	originalSnapshot: jsonb("original_snapshot"),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("attendance_corrections_check", sql`(requested_check_out IS NULL) OR (requested_check_in IS NULL) OR (requested_check_out > requested_check_in)`),
	check("attendance_corrections_check1", sql`num_nonnulls(requested_check_in, requested_check_out) > 0`),
	check("attendance_corrections_reason_check", sql`length(TRIM(BOTH FROM reason)) > 0`),
]);

export const performanceScoresInHrms = hrms.table("performance_scores", {
	orgId: uuid("org_id").notNull(),
	memberId: uuid("member_id").notNull(),
	computedOn: date("computed_on").notNull(),
	windowStart: date("window_start").notNull(),
	workingDays: numeric("working_days", { precision: 6, scale:  1 }).notNull(),
	attendancePoints: numeric("attendance_points", { precision: 6, scale:  2 }).notNull(),
	attendanceScore: numeric("attendance_score", { precision: 5, scale:  2 }),
	ratingCount: integer("rating_count").notNull(),
	ratingAvg: numeric("rating_avg", { precision: 4, scale:  3 }),
	ratingScore: numeric("rating_score", { precision: 5, scale:  2 }),
	ontimeTotal: integer("ontime_total").notNull(),
	ontimeOnTime: integer("ontime_on_time").notNull(),
	ontimeScore: numeric("ontime_score", { precision: 5, scale:  2 }),
	finalScore: numeric("final_score", { precision: 5, scale:  2 }),
	band: performanceBandInHrms(),
	isNew: boolean("is_new").notNull(),
	hasRatings: boolean("has_ratings").notNull(),
}, () => [
	pgPolicy("ceo_coo_read", { as: "permissive", for: "select", to: ["public"], using: sql`((org_id = current_org_id()) AND is_ceo_or_coo(current_member_id()))` }),
	check("performance_scores_check", sql`(final_score IS NULL) = (band IS NULL)`),
	check("performance_scores_final_score_check", sql`(final_score >= (0)::numeric) AND (final_score <= (100)::numeric)`),
]);

export const platformRequestsInHrms = hrms.table("platform_requests", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	type: platformReqTypeInHrms().notNull(),
	status: platformReqStatusInHrms().default('pending').notNull(),
	requestedBy: uuid("requested_by").notNull(),
	targetMemberId: uuid("target_member_id").notNull(),
	replacementUserId: uuid("replacement_user_id"),
	newEmail: citext("new_email"),
	verifiedByGm: uuid("verified_by_gm"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	resetTokenHash: text("reset_token_hash"),
	resetExpiresAt: timestamp("reset_expires_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("platform_requests_check", sql`(status <> ALL (ARRAY['verified'::platform_req_status, 'completed'::platform_req_status])) OR ((verified_by_gm IS NOT NULL) AND (verified_at IS NOT NULL))`),
	check("platform_requests_check1", sql`(type <> 'ceo_recovery'::platform_req_type) OR (new_email IS NOT NULL)`),
	check("platform_requests_check2", sql`(type <> 'remove_last_ceo'::platform_req_type) OR (replacement_user_id IS NOT NULL)`),
]);

export const notificationsInHrms = hrms.table("notifications", {
	id: bigserial({ mode: "bigint" }).notNull(),
	orgId: uuid("org_id").notNull(),
	recipientId: uuid("recipient_id").notNull(),
	kind: text().notNull(),
	needsDecision: boolean("needs_decision").default(false).notNull(),
	entityTable: text("entity_table"),
	entityId: uuid("entity_id"),
	title: text().notNull(),
	body: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("notifications_inbox_idx").using("btree", table.recipientId.asc().nullsLast().op("uuid_ops"), table.readAt.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const orgsInHrms = hrms.table("orgs", {
	id: uuid().defaultRandom().notNull(),
	name: text().notNull(),
	planCode: text("plan_code").notNull(),
	status: orgStatusInHrms().default('active').notNull(),
	createdByGm: uuid("created_by_gm"),
	paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true, mode: 'string' }),
	graceEndsAt: timestamp("grace_ends_at", { withTimezone: true, mode: 'string' }),
	readOnlyEndsAt: timestamp("read_only_ends_at", { withTimezone: true, mode: 'string' }),
	suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: 'string' }),
	purgeAfter: timestamp("purge_after", { withTimezone: true, mode: 'string' }),
	blockedByGm: uuid("blocked_by_gm"),
	blockedReason: text("blocked_reason"),
	blockedAt: timestamp("blocked_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(id = current_org_id())` }),
	check("orgs_check", sql`(status <> 'blocked'::org_status) OR ((blocked_by_gm IS NOT NULL) AND (blocked_reason IS NOT NULL) AND (blocked_at IS NOT NULL))`),
	check("orgs_check1", sql`(status <> 'grace'::org_status) OR (grace_ends_at IS NOT NULL)`),
	check("orgs_check2", sql`(status <> 'read_only'::org_status) OR (read_only_ends_at IS NOT NULL)`),
	check("orgs_check3", sql`(status <> 'suspended'::org_status) OR ((suspended_at IS NOT NULL) AND (purge_after IS NOT NULL))`),
]);

export const projectCompletionTicksInHrms = hrms.table("project_completion_ticks", {
	orgId: uuid("org_id").notNull(),
	projectId: uuid("project_id").notNull(),
	memberId: uuid("member_id").notNull(),
	tickedAt: timestamp("ticked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const meetingInviteesInHrms = hrms.table("meeting_invitees", {
	orgId: uuid("org_id").notNull(),
	meetingId: uuid("meeting_id").notNull(),
	memberId: uuid("member_id").notNull(),
	response: rsvpStatusInHrms().default('pending').notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const orgOfficeNetworksInHrms = hrms.table("org_office_networks", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	network: cidr().notNull(),
	label: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const orgHolidaysInHrms = hrms.table("org_holidays", {
	orgId: uuid("org_id").notNull(),
	holidayDate: date("holiday_date").notNull(),
	name: text().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
]);

export const notificationEmailPrefsInHrms = hrms.table("notification_email_prefs", {
	orgId: uuid("org_id").notNull(),
	memberId: uuid("member_id").notNull(),
	kind: text().notNull(),
	emailMuted: boolean("email_muted").default(true).notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("notification_email_prefs_kind_check", sql`kind <> 'request_needs_decision'::text`),
]);

export const auditLogInHrms = hrms.table("audit_log", {
	id: bigserial({ mode: "bigint" }).notNull(),
	orgId: uuid("org_id"),
	actorUserId: uuid("actor_user_id"),
	actorMemberId: uuid("actor_member_id"),
	action: text().notNull(),
	tableName: text("table_name").notNull(),
	rowId: text("row_id"),
	oldData: jsonb("old_data"),
	newData: jsonb("new_data"),
	clientIp: inet("client_ip"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_org_idx").using("btree", table.orgId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("audit_log_row_idx").using("btree", table.tableName.asc().nullsLast().op("text_ops"), table.rowId.asc().nullsLast().op("text_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`true`  }),
]);

export const auditNotesInHrms = hrms.table("audit_notes", {
	id: bigserial({ mode: "bigint" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	auditId: bigint("audit_id", { mode: "number" }).notNull(),
	orgId: uuid("org_id").notNull(),
	authorId: uuid("author_id").notNull(),
	note: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("audit_notes_note_check", sql`length(TRIM(BOTH FROM note)) > 0`),
]);

export const projectRatingsInHrms = hrms.table("project_ratings", {
	id: uuid().defaultRandom().notNull(),
	orgId: uuid("org_id").notNull(),
	projectId: uuid("project_id").notNull(),
	raterMemberId: uuid("rater_member_id").notNull(),
	rateeMemberId: uuid("ratee_member_id").notNull(),
	stars: smallint().notNull(),
	comment: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("project_ratings_ratee_idx").using("btree", table.rateeMemberId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	pgPolicy("org_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(org_id = current_org_id())`, withCheck: sql`(org_id = current_org_id())`  }),
	check("project_ratings_check", sql`rater_member_id <> ratee_member_id`),
	check("project_ratings_check1", sql`(stars > 2) OR (length(TRIM(BOTH FROM COALESCE(comment, ''::text))) > 0)`),
	check("project_ratings_stars_check", sql`(stars >= 1) AND (stars <= 5)`),
]);

export const refreshTokensInHrms = hrms.table("refresh_tokens", {
	id: uuid().defaultRandom().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	memberId: uuid("member_id"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	replacedBy: uuid("replaced_by"),
	ipAddress: inet("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("refresh_tokens_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(revoked_at IS NULL)`),
	check("refresh_tokens_check", sql`expires_at > created_at`),
]);

export const passwordResetsInHrms = hrms.table("password_resets", {
	id: uuid().defaultRandom().notNull(),
	userId: uuid("user_id").notNull(),
	purpose: text().notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("password_resets_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(used_at IS NULL)`),
	check("password_resets_check", sql`expires_at > created_at`),
	check("password_resets_purpose_check", sql`purpose = ANY (ARRAY['invite'::text, 'reset'::text, 'ceo_recovery'::text])`),
]);
export const vProjectFlagsInHrms = hrms.view("v_project_flags", {	projectId: uuid("project_id"),
	orgId: uuid("org_id"),
	name: text(),
	status: projectStatusInHrms(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	managerCount: bigint("manager_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	employeeCount: bigint("employee_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	leadCount: bigint("lead_count", { mode: "number" }),
	noManager: boolean("no_manager"),
	noEmployee: boolean("no_employee"),
}).with({"securityInvoker":true}).as(sql`SELECT p.id AS project_id, p.org_id, p.name, p.status, count(*) FILTER (WHERE pm.role = 'manager'::project_role) AS manager_count, count(*) FILTER (WHERE pm.role = 'employee'::project_role) AS employee_count, count(*) FILTER (WHERE pm.is_lead) AS lead_count, count(*) FILTER (WHERE pm.role = 'manager'::project_role) = 0 AS no_manager, count(*) FILTER (WHERE pm.role = 'employee'::project_role) = 0 AS no_employee FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.removed_at IS NULL WHERE p.status = ANY (ARRAY['active'::project_status, 'pending_lead_approval'::project_status]) GROUP BY p.id`);

export const vTaskFlagsInHrms = hrms.view("v_task_flags", {	taskId: uuid("task_id"),
	orgId: uuid("org_id"),
	projectId: uuid("project_id"),
	status: taskStatusInHrms(),
	urgency: taskUrgencyInHrms(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }),
	noManager: boolean("no_manager"),
	noEmployee: boolean("no_employee"),
	noAssignee: boolean("no_assignee"),
	overdue: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT t.id AS task_id, t.org_id, t.project_id, t.status, t.urgency, t.due_at, count(ta.*) FILTER (WHERE ta.role = 'manager'::project_role) = 0 AS no_manager, count(ta.*) FILTER (WHERE ta.role = 'employee'::project_role) = 0 AS no_employee, count(ta.*) = 0 AS no_assignee, t.due_at < now() AS overdue FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.removed_at IS NULL WHERE t.status <> ALL (ARRAY['done'::task_status, 'cancelled'::task_status]) GROUP BY t.id`);

export const vProjectProgressInHrms = hrms.view("v_project_progress", {	projectId: uuid("project_id"),
	orgId: uuid("org_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	doneTasks: bigint("done_tasks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	countedTasks: bigint("counted_tasks", { mode: "number" }),
	percentDone: numeric("percent_done"),
}).with({"securityInvoker":true}).as(sql`SELECT p.id AS project_id, p.org_id, count(t.*) FILTER (WHERE t.status = 'done'::task_status) AS done_tasks, count(t.*) FILTER (WHERE t.status <> 'cancelled'::task_status) AS counted_tasks, CASE WHEN count(t.*) FILTER (WHERE t.status <> 'cancelled'::task_status) = 0 THEN NULL::numeric ELSE round(100.0 * count(t.*) FILTER (WHERE t.status = 'done'::task_status)::numeric / count(t.*) FILTER (WHERE t.status <> 'cancelled'::task_status)::numeric, 1) END AS percent_done FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id`);

export const vApprovedLeaveInHrms = hrms.view("v_approved_leave", {	requestId: uuid("request_id"),
	orgId: uuid("org_id"),
	memberId: uuid("member_id"),
	leaveTypeId: uuid("leave_type_id"),
	startDate: date("start_date"),
	endDate: date("end_date"),
	startHalfDay: boolean("start_half_day"),
	endHalfDay: boolean("end_half_day"),
	days: numeric({ precision: 5, scale:  1 }),
	reason: text(),
	overAllowance: boolean("over_allowance"),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	leaveCode: text("leave_code"),
	isPaid: boolean("is_paid"),
}).with({"securityInvoker":true}).as(sql`SELECT lr.request_id, lr.org_id, lr.member_id, lr.leave_type_id, lr.start_date, lr.end_date, lr.start_half_day, lr.end_half_day, lr.days, lr.reason, lr.over_allowance, lr.cancelled_at, lt.code AS leave_code, lt.is_paid FROM leave_requests lr JOIN requests r ON r.id = lr.request_id JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE (r.status = ANY (ARRAY['approved'::request_status, 'applied'::request_status])) AND lr.cancelled_at IS NULL`);

export const vMemberWorkloadInHrms = hrms.view("v_member_workload", {	memberId: uuid("member_id"),
	orgId: uuid("org_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	openTasks: bigint("open_tasks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	activeProjects: bigint("active_projects", { mode: "number" }),
	level: text(),
	onLeaveUntil: date("on_leave_until"),
}).with({"securityInvoker":true}).as(sql`WITH t AS ( SELECT ta.member_id, count(DISTINCT ta.task_id) AS open_tasks FROM task_assignees ta JOIN tasks tk ON tk.id = ta.task_id JOIN projects p ON p.id = tk.project_id WHERE ta.removed_at IS NULL AND (tk.status <> ALL (ARRAY['done'::task_status, 'cancelled'::task_status])) AND (p.status = ANY (ARRAY['active'::project_status, 'pending_lead_approval'::project_status])) GROUP BY ta.member_id ), pr AS ( SELECT pm.member_id, count(DISTINCT pm.project_id) AS active_projects FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE pm.removed_at IS NULL AND (p.status = ANY (ARRAY['active'::project_status, 'pending_lead_approval'::project_status])) GROUP BY pm.member_id ) SELECT m.id AS member_id, m.org_id, COALESCE(t.open_tasks, 0::bigint) AS open_tasks, COALESCE(pr.active_projects, 0::bigint) AS active_projects, CASE WHEN COALESCE(t.open_tasks, 0::bigint) >= s.workload_red_tasks OR COALESCE(pr.active_projects, 0::bigint) >= s.workload_red_projects THEN 'red'::text WHEN COALESCE(t.open_tasks, 0::bigint) >= s.workload_amber_tasks OR COALESCE(pr.active_projects, 0::bigint) >= s.workload_amber_projects THEN 'amber'::text ELSE 'green'::text END AS level, ( SELECT max(l.end_date) AS max FROM v_approved_leave l WHERE l.member_id = m.id AND CURRENT_DATE >= l.start_date AND CURRENT_DATE <= l.end_date) AS on_leave_until FROM org_members m JOIN org_settings s ON s.org_id = m.org_id LEFT JOIN t ON t.member_id = m.id LEFT JOIN pr ON pr.member_id = m.id WHERE m.status = 'active'::member_status AND (m.role = ANY (ARRAY['manager'::member_role, 'employee'::member_role]))`);

export const vLeaveBalanceInHrms = hrms.view("v_leave_balance", {	memberId: uuid("member_id"),
	orgId: uuid("org_id"),
	leaveTypeId: uuid("leave_type_id"),
	code: text(),
	year: integer(),
	allowance: numeric({ precision: 5, scale:  1 }),
	used: numeric(),
	remaining: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT m.id AS member_id, m.org_id, lt.id AS leave_type_id, lt.code, y.year, lt.yearly_allowance_days AS allowance, COALESCE(sum(l.days) FILTER (WHERE EXTRACT(year FROM l.start_date) = y.year::numeric), 0::numeric) AS used, lt.yearly_allowance_days - COALESCE(sum(l.days) FILTER (WHERE EXTRACT(year FROM l.start_date) = y.year::numeric), 0::numeric) AS remaining FROM org_members m JOIN leave_types lt ON lt.org_id = m.org_id AND lt.is_active CROSS JOIN ( SELECT EXTRACT(year FROM CURRENT_DATE)::integer AS year) y LEFT JOIN v_approved_leave l ON l.member_id = m.id AND l.leave_type_id = lt.id WHERE m.status = 'active'::member_status GROUP BY m.id, lt.id, y.year`);

export const vCalendarEventsInHrms = hrms.view("v_calendar_events", {	orgId: uuid("org_id"),
	memberId: uuid("member_id"),
	kind: text(),
	refId: uuid("ref_id"),
	title: text(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }),
	link: text(),
	location: text(),
}).with({"securityInvoker":true}).as(sql`SELECT ta.org_id, ta.member_id, 'task_due'::text AS kind, t.id AS ref_id, t.title, t.due_at AS starts_at, t.due_at AS ends_at, NULL::text AS link, NULL::text AS location FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id WHERE ta.removed_at IS NULL AND (t.status <> ALL (ARRAY['done'::task_status, 'cancelled'::task_status])) UNION ALL SELECT mi.org_id, mi.member_id, 'meeting'::text AS kind, mt.id AS ref_id, mt.title, mt.starts_at, mt.ends_at, mt.meeting_link AS link, mt.location FROM meeting_invitees mi JOIN meetings mt ON mt.id = mi.meeting_id WHERE mt.cancelled_at IS NULL UNION ALL SELECT mt.org_id, mt.created_by AS member_id, 'meeting'::text AS kind, mt.id AS ref_id, mt.title, mt.starts_at, mt.ends_at, mt.meeting_link AS link, mt.location FROM meetings mt WHERE mt.cancelled_at IS NULL UNION ALL SELECT l.org_id, l.member_id, 'leave'::text AS kind, l.request_id AS ref_id, initcap(l.leave_code) || ' leave'::text AS title, l.start_date::timestamp with time zone AS starts_at, (l.end_date + 1)::timestamp with time zone AS ends_at, NULL::text AS link, NULL::text AS location FROM v_approved_leave l UNION ALL SELECT h.org_id, NULL::uuid AS member_id, 'holiday'::text AS kind, NULL::uuid AS ref_id, h.name AS title, h.holiday_date::timestamp with time zone AS starts_at, (h.holiday_date + 1)::timestamp with time zone AS ends_at, NULL::text AS link, NULL::text AS location FROM org_holidays h`);

export const vOrgSeatUsageInHrms = hrms.view("v_org_seat_usage", {	orgId: uuid("org_id"),
	planCode: text("plan_code"),
	seatLimit: integer("seat_limit"),
	seatsUsed: integer("seats_used"),
	percentUsed: numeric("percent_used"),
	warningLevel: integer("warning_level"),
}).with({"securityInvoker":true}).as(sql`SELECT o.id AS org_id, o.plan_code, p.seat_limit, org_seats_used(o.id) AS seats_used, round(100.0 * org_seats_used(o.id)::numeric / p.seat_limit::numeric, 1) AS percent_used, CASE WHEN org_seats_used(o.id) >= p.seat_limit THEN 100 WHEN org_seats_used(o.id)::numeric >= (p.seat_limit::numeric * 0.95) THEN 95 WHEN org_seats_used(o.id)::numeric >= (p.seat_limit::numeric * 0.80) THEN 80 ELSE NULL::integer END AS warning_level FROM orgs o JOIN plans p ON p.code = o.plan_code`);

export const vDowngradeCandidatesInHrms = hrms.view("v_downgrade_candidates", {	orgId: uuid("org_id"),
	memberId: uuid("member_id"),
	fullName: text("full_name"),
	role: memberRoleInHrms(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	suggestedOrder: bigint("suggested_order", { mode: "number" }),
}).with({"securityInvoker":true}).as(sql`SELECT m.org_id, m.id AS member_id, u.full_name, m.role, m.last_active_at, row_number() OVER (PARTITION BY m.org_id ORDER BY m.last_active_at NULLS FIRST) AS suggested_order FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.status = 'active'::member_status AND (m.role = ANY (ARRAY['manager'::member_role, 'employee'::member_role]))`);

export const vPerformanceDashboardInHrms = hrms.view("v_performance_dashboard", {	orgId: uuid("org_id"),
	memberId: uuid("member_id"),
	computedOn: date("computed_on"),
	finalScore: numeric("final_score", { precision: 5, scale:  2 }),
	band: performanceBandInHrms(),
	isNew: boolean("is_new"),
	hasRatings: boolean("has_ratings"),
	attendanceScore: numeric("attendance_score", { precision: 5, scale:  2 }),
	ratingScore: numeric("rating_score", { precision: 5, scale:  2 }),
	ontimeScore: numeric("ontime_score", { precision: 5, scale:  2 }),
	changeVsPrev30D: numeric("change_vs_prev_30d"),
}).with({"securityInvoker":true}).as(sql`SELECT cur.org_id, cur.member_id, cur.computed_on, cur.final_score, cur.band, cur.is_new, cur.has_ratings, cur.attendance_score, cur.rating_score, cur.ontime_score, cur.final_score - prev.final_score AS change_vs_prev_30d FROM ( SELECT DISTINCT ON (performance_scores.member_id) performance_scores.org_id, performance_scores.member_id, performance_scores.computed_on, performance_scores.window_start, performance_scores.working_days, performance_scores.attendance_points, performance_scores.attendance_score, performance_scores.rating_count, performance_scores.rating_avg, performance_scores.rating_score, performance_scores.ontime_total, performance_scores.ontime_on_time, performance_scores.ontime_score, performance_scores.final_score, performance_scores.band, performance_scores.is_new, performance_scores.has_ratings FROM performance_scores ORDER BY performance_scores.member_id, performance_scores.computed_on DESC) cur LEFT JOIN performance_scores prev ON prev.member_id = cur.member_id AND prev.computed_on = (cur.computed_on - 30)`);

export const vRatingSummaryInHrms = hrms.view("v_rating_summary", {	orgId: uuid("org_id"),
	memberId: uuid("member_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ratingCount: bigint("rating_count", { mode: "number" }),
	ratingAvg: numeric("rating_avg"),
}).as(sql`SELECT r.org_id, r.ratee_member_id AS member_id, count(*) AS rating_count, round(avg(r.stars), 2) AS rating_avg FROM project_ratings r JOIN org_settings s ON s.org_id = r.org_id WHERE r.org_id = current_org_id() AND r.created_at >= (now() - '1 year'::interval) GROUP BY r.org_id, r.ratee_member_id, s.rating_min_count HAVING count(*) >= s.rating_min_count`);