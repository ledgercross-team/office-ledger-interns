export type Role = "owner" | "manager" | "employee";
export type MemberStatus = "pending" | "active" | "rejected" | "deactivated";
export type ThemeMode = "light" | "dark" | "system";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  theme: ThemeMode;
  twoFactorEnabled: boolean;
}

export interface SessionInfo {
  id: string;
  expiresAt: Date;
}

/** Resolved tenant context for the current request (active workspace + membership). */
export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  timezone: string;
  membershipId: string;
  role: Role;
  status: MemberStatus;
  employeeCode: string | null;
  departmentId: string | null;
}
