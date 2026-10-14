// Role names of the new system. Not the same as v1's Role type.
export type HrmsRole = 'gameMaster' | 'ceo' | 'coo' | 'manager' | 'employee';
export type HrmsMemberRole = Exclude<HrmsRole, 'gameMaster'>;
export type OrgStatus = 'active' | 'grace' | 'read_only' | 'suspended' | 'blocked';

export interface HrmsMembership {
  memberId: string;
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  role: HrmsMemberRole;
  status: 'active' | 'suspended' | 'deactivated';
  usable: boolean;
}

export interface HrmsSession {
  user: {
    id: string;
    email: string;
    fullName: string;
    timezone: string;
    mfaEnabled: boolean;
    mfaSetupRequired?: boolean;
    mustChangePassword?: boolean;
  };
  isGameMaster: boolean;
  memberships: HrmsMembership[];
  activeMemberId: string | null;
  role: HrmsRole | null;
  org: { id: string; name: string; status: OrgStatus } | null;
  needsOrgSelection: boolean;
}

export const HRMS_ROLE_LABELS: Record<HrmsRole, string> = {
  gameMaster: 'Game master',
  ceo: 'CEO',
  coo: 'COO',
  manager: 'Manager',
  employee: 'Employee',
};

export type MemberStatus = 'active' | 'suspended' | 'deactivated';

export interface HrmsMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  timezone: string;
  role: HrmsMemberRole;
  status: MemberStatus;
  taskApprovalRequired: boolean;
  canViewAllProjects: boolean;
  designation: string | null;
  department: string | null;
  employeeCode: string | null;
  /** Only present for a CEO or COO looking at someone else's profile. */
  mfaEnabled?: boolean;
  /** A CEO or COO made them set it up; it turns on once they confirm a code. */
  mfaSetupRequired?: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SeatUsage {
  planCode: string;
  seatLimit: number;
  seatsUsed: number;
  percentUsed: number;
  warningLevel: 80 | 95 | 100 | null;
}

export interface OrgSettings {
  timezone: string;
  workStartTime: string;
  lateGraceMinutes: number;
  weekendDays: number[];
  requestExpiryWorkingDays: number;
  workloadAmberTasks: number;
  workloadAmberProjects: number;
  workloadRedTasks: number;
  workloadRedProjects: number;
  weightAttendance: number;
  weightRating: number;
  weightOntime: number;
  pointsLate: number;
  pointsMissingCheckout: number;
  pointsUnpaidLeave: number;
  ratingMinCount: number;
  ratingPriorWeight: number;
  ratingWindowDays: number;
  highUrgencyReminderHours: number;
}

export interface HrmsOrg {
  id: string;
  name: string;
  status: OrgStatus;
  settings: OrgSettings;
  seats?: SeatUsage;
}

export interface OfficeNetwork {
  id: string;
  network: string;
  label: string | null;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  yearlyAllowanceDays: number;
  isPaid: boolean;
  isActive: boolean;
}

export interface CreateMemberResponse {
  /** One-time password for a brand-new account. Shown once; they must change it at first sign-in. */
  temporaryPassword?: string;
  member: HrmsMember | null;
  attached: boolean;
  invited: boolean;
}

export type ProjectStatus = 'active' | 'pending_lead_approval' | 'completed' | 'archived';

export interface ProjectProgress {
  doneTasks: number;
  countedTasks: number;
  /** null when the project has no tasks yet. */
  percentDone: number | null;
}

export interface HrmsProject {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  createdBy: string;
  completionRequestedAt: string | null;
  completedAt: string | null;
  ratingClosesAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  managerCount: number;
  employeeCount: number;
  leadCount: number;
  flags: { noManager: boolean; noEmployee: boolean };
  progress: ProjectProgress;
  myRole: 'manager' | 'employee' | null;
  iAmLead: boolean;
}

export interface ProjectMember {
  id: string;
  memberId: string;
  fullName: string;
  designation: string | null;
  role: 'manager' | 'employee';
  isLead: boolean;
  addedAt: string;
  ticked: boolean | null;
}

export interface HrmsProjectDetail extends HrmsProject {
  members: ProjectMember[];
  completion: {
    managersTotal: number;
    managersTicked: number;
    approver: 'lead' | 'ceo_or_coo';
  };
}

export type InviteStatus =
  'pending' | 'accepted' | 'declined' | 'decline_accepted' | 'overruled' | 'expired';

export interface ProjectInvite {
  id: string;
  project: { id: string; name: string };
  role: 'manager' | 'employee';
  status: InviteStatus;
  declineReason: string | null;
  reviewReason: string | null;
  invitedBy: { id: string; fullName: string };
  invitee: { id: string; fullName: string };
  respondedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked' | 'cancelled';
export type TaskUrgency = 'high' | 'medium' | 'low';

export interface TaskAssignee {
  memberId: string;
  fullName: string;
  role: 'manager' | 'employee';
}

export interface HrmsTask {
  id: string;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  title: string;
  description: string | null;
  status: TaskStatus;
  urgency: TaskUrgency;
  dueAt: string;
  statusComment: string | null;
  blockedReason: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  assignees: TaskAssignee[];
  flags: { noManager: boolean; noEmployee: boolean; noAssignee: boolean; overdue: boolean };
  myAssignment: 'manager' | 'employee' | null;
}

export interface TaskHistoryItem {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  comment: string | null;
  changedBy: { id: string; fullName: string | null } | null;
  changedAt: string;
}

export type RequestType =
  | 'create_user'
  | 'create_project'
  | 'add_to_project'
  | 'create_task'
  | 'assign_task'
  | 'add_and_assign'
  | 'leave'
  | 'leave_change'
  | 'attendance_correction';
export type RequestStatus =
  'pending' | 'approved' | 'applied' | 'rejected' | 'cancelled' | 'expired';

export interface HrmsRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  requestedBy: { id: string; fullName: string; role: HrmsMemberRole };
  project: { id: string; name: string } | null;
  subject: { id: string; fullName: string } | null;
  task: { id: string; title: string } | null;
  payload: Record<string, unknown>;
  reason: string | null;
  decidedBy: { id: string; fullName: string } | null;
  decidedAt: string | null;
  decisionReason: string | null;
  appliedAt: string | null;
  expiresAt: string;
  createdAt: string;
  canDecide: boolean;
  cannotDecideBecause: string | null;
  canCancel: boolean;
}

export interface BulkResult {
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

export type AttendanceDayStatus =
  'present' | 'late' | 'absent' | 'on_leave' | 'holiday' | 'weekend';

export interface AttendanceToday {
  date: string;
  status: AttendanceDayStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface AttendanceDayEntry {
  date: string;
  status: AttendanceDayStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  autoCheckedOut: boolean;
  corrected: boolean;
  holiday: string | null;
  leaveType: string | null;
}

export interface AttendanceCorrectionEntry {
  requestId: string;
  workDate: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  original: { status?: string; check_in_at?: string | null; check_out_at?: string | null } | null;
  status: RequestStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  createdAt: string;
}

export interface AttendanceMonth {
  /** The organisation's date today (its own time zone). */
  todayDate: string;
  month: string;
  days: AttendanceDayEntry[];
  corrections: AttendanceCorrectionEntry[];
}

export interface AttendanceMe extends AttendanceMonth {
  today: AttendanceToday;
}

export interface TeamAttendanceDay {
  date: string | null;
  items: Array<{
    memberId: string;
    fullName: string;
    role: HrmsMemberRole;
    status: AttendanceDayStatus | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    autoCheckedOut: boolean;
  }>;
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  isPaid: boolean;
  year: number;
  allowance: number;
  used: number;
  remaining: number;
}

export interface HrmsLeave {
  requestId: string;
  member: { id: string; fullName: string };
  leaveType: { id: string; name: string; isPaid: boolean };
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  days: number;
  reason: string;
  overAllowance: boolean;
  status: RequestStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  createdAt: string;
  canCancel: boolean;
  canDecide: boolean;
  cannotDecideBecause: string | null;
}

export interface CalendarItem {
  kind: 'task_due' | 'meeting' | 'leave' | 'holiday';
  refId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  startsAtLocal: string;
  endsAtLocal: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  link: string | null;
  location: string | null;
  member: { id: string; fullName: string } | null;
}

export interface CalendarFeed {
  timezone: string;
  from: string;
  to: string;
  items: CalendarItem[];
}

export interface HrmsMeeting {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
  meetingLink: string | null;
  location: string | null;
  projectId: string | null;
  createdBy: { id: string; fullName: string };
  cancelled: boolean;
  invitees: Array<{
    memberId: string;
    fullName: string;
    response: 'pending' | 'accepted' | 'declined';
  }>;
  canEdit: boolean;
}

export type WorkloadLevel = 'green' | 'amber' | 'red';

export interface WorkloadItem {
  memberId: string;
  fullName: string;
  role: HrmsMemberRole;
  openTasks: number;
  activeProjects: number;
  level: WorkloadLevel;
  onLeaveUntil: string | null;
}

export type PerformanceBand = 'excellent' | 'good' | 'needs_attention' | 'poor';

export interface PerformanceRow {
  memberId: string;
  fullName: string;
  role: HrmsMemberRole;
  computedOn: string;
  score: number | null;
  band: PerformanceBand | null;
  isNew: boolean;
  hasRatings: boolean;
  trend: 'up' | 'down' | 'flat' | null;
  changeVsPrev30d: number | null;
}

export interface PerformanceBreakdown {
  memberId: string;
  fullName: string;
  role: HrmsMemberRole;
  computedOn: string;
  windowStart: string;
  score: number | null;
  band: PerformanceBand | null;
  isNew: boolean;
  hasRatings: boolean;
  attendance: {
    score: number | null;
    points: number | null;
    workingDays: number | null;
    weight: number | null;
  };
  ratings: {
    score: number | null;
    average: number | null;
    count: number;
    weight: number | null;
    summary: { count: number; average: number } | null;
  };
  onTime: { score: number | null; done: number; total: number; weight: number | null };
  earlyBonus: { tasks: number };
  history: Array<{ computedOn: string; score: number | null; band: PerformanceBand | null }>;
}

export interface RatingsDueProject {
  projectId: string;
  projectName: string;
  completedAt: string | null;
  closesAt: string | null;
  ratees: Array<{ memberId: string; fullName: string; role: HrmsMemberRole }>;
}

export interface HrmsNotification {
  id: string;
  kind: string;
  needsDecision: boolean;
  entityTable: string | null;
  entityId: string | null;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsPage {
  items: HrmsNotification[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailPref {
  kind: string;
  label: string;
  muted: boolean;
  canMute: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  table: string;
  rowId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
  actor: { id: string; fullName: string | null } | null;
  notes: Array<{ id: string; note: string; authorName: string; createdAt: string }>;
}

export interface PlatformOrg {
  id: string;
  name: string;
  status: OrgStatus;
  planCode: string;
  ceoCount: number;
  cooCount: number;
  overThreshold: boolean;
  seatsUsed: number;
  seatLimit: number;
}

export interface PlatformRequest {
  id: string;
  orgId: string;
  orgName: string;
  type: 'ceo_recovery' | 'remove_last_ceo';
  status: 'pending' | 'verified' | 'completed' | 'rejected';
  newEmail: string | null;
  createdAt: string;
}

export interface PlatformGameMaster {
  userId: string;
  email: string;
  fullName: string;
  status: 'pending_confirmation' | 'active' | 'removed';
  createdBy: string | null;
  confirmedBy: string | null;
  createdAt: string;
}
