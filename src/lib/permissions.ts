/**
 * The single source of truth for "who can do what". Used by middleware (route guards), Astro
 * Actions (mutations) and data loaders (query scoping). The UI only mirrors these answers.
 */
import type { Role, WorkspaceContext } from "./auth-types";

export type Action =
  | "dashboard.org"
  | "inbox.view"
  | "inbox.review"
  | "employees.view"
  | "employees.manage"
  | "employees.import"
  | "roles.manage"
  | "ownership.transfer"
  | "attendance.checkin"
  | "attendance.viewAll"
  | "leave.request"
  | "leave.review"
  | "tasks.manage"
  | "tasks.create"
  | "tasks.update"
  | "meetings.manage"
  | "meetings.rsvp"
  | "holidays.mark"
  | "holidays.approve"
  | "performance.viewAll"
  | "performance.viewOwn"
  | "report.view"
  | "complaints.submit"
  | "complaints.process"
  | "complaints.seeAnonymous"
  | "settings.view"
  | "settings.edit"
  | "audit.view"
  | "announcements.post"
  | "invite.manage"
  | "workspace.delete"
  | "profile.viewOther";

/** Resource details for checks that depend on *who* is affected. */
export interface Resource {
  /** Membership the record belongs to / was requested by. */
  ownerMembershipId?: string | null;
  /** Role of that member. */
  ownerRole?: Role | null;
  /** Target role when assigning roles. */
  targetRole?: Role;
  /** For tasks: assignee membership ids and creator. */
  assigneeIds?: string[];
  createdBy?: string | null;
  /** Inbox item kind. */
  kind?: string;
  anonymousVisibleToOwner?: boolean;
}

const managerial = (r: Role) => r === "owner" || r === "manager";

const MATRIX: Record<Action, Role[]> = {
  "dashboard.org": ["owner", "manager"],
  "inbox.view": ["owner", "manager"],
  "inbox.review": ["owner", "manager"],
  "employees.view": ["owner", "manager"],
  "employees.manage": ["owner", "manager"],
  "employees.import": ["owner", "manager"],
  "roles.manage": ["owner"],
  "ownership.transfer": ["owner"],
  "attendance.checkin": ["owner", "manager", "employee"],
  "attendance.viewAll": ["owner", "manager"],
  "leave.request": ["employee"],
  "leave.review": ["owner", "manager"],
  "tasks.manage": ["owner", "manager"],
  "tasks.create": ["owner", "manager", "employee"],
  "tasks.update": ["owner", "manager", "employee"],
  "meetings.manage": ["owner", "manager"],
  "meetings.rsvp": ["owner", "manager", "employee"],
  "holidays.mark": ["owner", "manager"],
  "holidays.approve": ["owner"],
  "performance.viewAll": ["owner", "manager"],
  "performance.viewOwn": ["owner", "manager", "employee"],
  "report.view": ["owner", "manager"],
  "complaints.submit": ["manager", "employee"],
  "complaints.process": ["owner", "manager"],
  "complaints.seeAnonymous": ["owner"],
  "settings.view": ["owner", "manager"],
  "settings.edit": ["owner"],
  "audit.view": ["owner"],
  "announcements.post": ["owner", "manager"],
  "invite.manage": ["owner"],
  "workspace.delete": ["owner"],
  "profile.viewOther": ["owner", "manager"],
};

export function can(ctx: Pick<WorkspaceContext, "role" | "membershipId" | "status"> | null, action: Action, res: Resource = {}): boolean {
  if (!ctx || ctx.status !== "active") return false;
  if (!MATRIX[action].includes(ctx.role)) return false;

  switch (action) {
    case "inbox.review":
    case "leave.review":
      // Nobody reviews their own items; managers cannot review other managers' (or the owner's) items.
      if (res.ownerMembershipId && res.ownerMembershipId === ctx.membershipId) return false;
      if (ctx.role === "manager" && res.ownerRole && res.ownerRole !== "employee") return false;
      if (res.kind && (res.kind === "holiday_add" || res.kind === "holiday_remove")) return ctx.role === "owner";
      return true;
    case "employees.manage":
      // Managers may manage employees only; nobody but the owner touches owner/manager memberships.
      if (ctx.role === "manager") {
        if (res.ownerRole && res.ownerRole !== "employee") return false;
        if (res.targetRole && res.targetRole !== "employee") return false;
      }
      if (res.ownerRole === "owner" && res.targetRole && res.targetRole !== "owner") return false;
      return true;
    case "tasks.update":
      if (managerial(ctx.role)) return true;
      return (
        (res.assigneeIds ?? []).includes(ctx.membershipId) || (!!res.createdBy && res.createdBy === ctx.membershipId)
      );
    case "profile.viewOther":
      return true;
    default:
      return true;
  }
}

/** Route guards: first matching prefix wins. Unlisted /app routes need an active membership only. */
export const ROUTE_RULES: [prefix: string, action: Action][] = [
  ["/app/inbox", "inbox.view"],
  ["/app/employees", "employees.view"],
  ["/app/reports", "report.view"],
  ["/app/settings/audit", "audit.view"],
  ["/app/settings", "settings.view"],
];

export function routeAllowed(ctx: WorkspaceContext, pathname: string) {
  const rule = ROUTE_RULES.find(([p]) => pathname === p || pathname.startsWith(p + "/"));
  return !rule || can(ctx, rule[1]);
}

export const isManagerial = (ctx: Pick<WorkspaceContext, "role"> | null) => !!ctx && managerial(ctx.role);
