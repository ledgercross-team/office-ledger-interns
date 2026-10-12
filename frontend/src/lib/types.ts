export type Role = 'game_master' | 'admin' | 'manager' | 'employee';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'delayed'
  | 'done'
  | 'incomplete'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskCategory =
  | 'general'
  | 'onboarding'
  | 'recruitment'
  | 'payroll'
  | 'leave_attendance'
  | 'training'
  | 'performance_review'
  | 'compliance'
  | 'it_support';

export type TaskActivityType = 'comment' | 'status_change';

export type TaskAction =
  | 'start'
  | 'done'
  | 'delayed'
  | 'incomplete'
  | 'reopen'
  | 'cancel';

export type AttendanceStatus = 'present' | 'late';

export type AttendanceDayStatus = AttendanceStatus | 'absent';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  companyId: string | null;
  mustChangePassword: boolean;
  subscriptionActive?: boolean;
  // IANA timezone of the user's company; "today" and deadlines are shown on its clock.
  companyTimezone?: string;
}

export interface AuthSession {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface TemporaryPassword {
  temporaryPassword: string;
}

export interface Company {
  id: string;
  name: string;
  timezone: string;
  workStartTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  companyId: string;
  planName: string;
  startsOn: string;
  endsOn: string;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  companyId: string;
  role: Role;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  // Employees only: who they report to.
  managerId: string | null;
  managerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string;
  assigneeId: string;
  assigneeName?: string;
  createdById: string;
  creatorName?: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  overdue?: boolean;
  allowedActions?: TaskAction[];
  canEdit?: boolean;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  actorId: string;
  actorName?: string;
  type: TaskActivityType;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  comment: string | null;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  userId: string;
  userFullName?: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: AttendanceStatus;
  note: string | null;
  editedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceDay {
  workDate: string;
  status: AttendanceDayStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  record: AttendanceRecord | null;
}

// A row of GET /attendance?date= : one person on one day.
export interface TeamAttendanceRow extends AttendanceDay {
  userId: string;
  userFullName: string;
  role: Role;
}

export interface Message {
  id: string;
  companyId: string;
  senderId: string;
  senderName?: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface GameMasterCompany {
  id: string;
  name: string;
  timezone: string;
  workStartTime: string;
  isActive: boolean;
  adminName: string | null;
  adminEmail: string | null;
  adminCount: number;
  subscription: Subscription | null;
  daysLeft: number | null;
  unreadCount: number;
}

export interface DashboardToday {
  workDate: string;
  // null on a weekend with no record.
  status: AttendanceDayStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface OverdueItem {
  id: string;
  title: string;
  status: TaskStatus;
  deadline: string;
  assigneeId: string;
  assigneeName: string;
}

export type TasksByStatus = Record<TaskStatus, number>;

export interface AttendanceCounts {
  total: number;
  present: number;
  late: number;
  absent: number;
}

// Shape depends on the caller's role (backend GET /dashboard/summary).
export interface DashboardSummary {
  role: Role;
  timezone: string;
  openTasks: number;
  overdueTasks: number;
  doneThisWeek: number;
  // employee and manager
  today?: DashboardToday;
  // manager: the employees they manage
  team?: {
    people: number;
    openTasks: number;
    overdueTasks: number;
    doneThisWeek: number;
    tasksByStatus: TasksByStatus;
    overdueList: OverdueItem[];
    attendance: AttendanceCounts;
  };
  // admin
  activePeople?: number;
  peopleByRole?: Record<Role, number>;
  tasksByStatus?: TasksByStatus;
  overdueList?: OverdueItem[];
  attendance?: AttendanceCounts;
  todayAttendanceRate?: number;
  subscriptionEndsOn?: string | null;
  daysLeft?: number | null;
  unreadMessages?: number;
}

export interface CompanySubscription {
  current: Subscription | null;
  daysLeft: number | null;
  items: Subscription[];
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string;
}

export interface CompanyAdmin {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
}

export interface GameMasterCompanyDetail {
  company: Company;
  admins: CompanyAdmin[];
  subscriptions: Subscription[];
}

export interface CreateCompanyResponse {
  company: Company;
  admin: { id: string; fullName: string; email: string };
  subscription: Subscription;
  temporaryPassword: string;
}

export type Tendency = 'no_data' | 'early_bird' | 'on_time' | 'cutting_it_close' | 'often_late';
export type Trend = 'unknown' | 'improving' | 'steady' | 'slipping';

export interface StatsDay {
  date: string;
  status: AttendanceDayStatus;
  // Minutes since local midnight, in the company's timezone.
  checkInMinutes: number | null;
  checkOutMinutes: number | null;
  hours: number | null;
}

// GET /attendance/stats/me and /attendance/stats/users/:id
export interface AttendanceStats {
  timezone: string;
  days: number;
  user: { id: string; fullName: string; role: Role };
  from: string;
  to: string;
  workStartMinutes: number;
  expectedDays: number;
  daysOnTime: number;
  daysLate: number;
  daysAbsent: number;
  missedCheckOuts: number;
  attendanceRate: number | null;
  punctualityRate: number | null;
  avgCheckInMinutes: number | null;
  avgCheckOutMinutes: number | null;
  // Minutes after (+) or before (-) the work start time.
  avgArrivalOffset: number | null;
  avgHoursWorked: number | null;
  score: number | null;
  tendency: Tendency;
  trend: Trend;
  series: StatsDay[];
}

export interface TeamStatsRow extends Omit<AttendanceStats, 'series' | 'user' | 'timezone' | 'days'> {
  userId: string;
  fullName: string;
  role: Role;
}

// GET /attendance/stats/team
export interface TeamStats {
  timezone: string;
  days: number;
  month: string | null;
  from: string;
  to: string;
  workStartMinutes: number;
  summary: {
    people: number;
    avgScore: number | null;
    avgArrivalOffset: number | null;
    onTimeRate: number | null;
    attendance: {
      total: number;
      onTime: number;
      late: number;
      absent: number;
      onTimePercentage: number | null;
      latePercentage: number | null;
      absentPercentage: number | null;
    };
  };
  people: TeamStatsRow[];
}

export interface ManagerOption {
  id: string;
  fullName: string;
}
