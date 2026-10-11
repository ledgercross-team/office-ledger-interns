export type Role = 'game_master' | 'admin' | 'manager' | 'employee';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'delayed'
  | 'done'
  | 'incomplete'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high';

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
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
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
  subscription: Subscription | null;
  daysLeft: number | null;
  unreadCount: number;
}

export interface DashboardSummary {
  role: Role;
  openTasks: number;
  overdueTasks: number;
  doneThisWeek: number;
  activePeople?: number;
  peopleByRole?: Record<Role, number>;
  todayAttendanceRate?: number;
  subscriptionEndsOn?: string | null;
  daysLeft?: number | null;
  unreadMessages?: number;
}
