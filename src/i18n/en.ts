/**
 * English UI strings. Every user-facing label used by layouts, heroes, navigation and shared
 * components lives here so a second locale is a copy of this file. `{name}` placeholders are
 * filled by `t()`.
 */
export const en = {
  brand: "Office Ledger",
  skipToContent: "Skip to content",
  nav: {
    main: "Main",
    operations: "Operations",
    reports: "Reports",
    workspace: "Workspace",
    dashboard: "Dashboard",
    inbox: "Inbox",
    employees: "Employees",
    attendance: "Attendance",
    leave: "Leave Requests",
    tasks: "Taskboard",
    calendar: "Calendar",
    performance: "Performance",
    dailyReport: "Daily Report",
    complaints: "Complaints",
    settings: "Settings",
    profile: "My Profile",
    signOut: "Sign out",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    switchWorkspace: "Switch workspace",
  },
  topbar: {
    notifications: "Notifications",
    announcements: "Announcements",
    theme: "Theme",
    search: "Search",
    light: "Light",
    dark: "Dark",
    system: "System",
    openMenu: "Open navigation",
  },
  common: {
    refresh: "Refresh",
    approve: "Approve",
    reject: "Reject",
    cancel: "Cancel",
    save: "Save changes",
    saved: "Saved",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
    exportCsv: "Export CSV",
    search: "Search",
    clearFilters: "Clear filters",
    all: "All",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    loading: "Loading…",
    somethingWrong: "Something went wrong",
    noPermission: "You don't have permission to do that.",
    readOnly: "Read only",
    offline: "You're offline. Changes will fail until you reconnect.",
  },
  status: {
    present: "Present",
    late: "Late",
    remote: "Remote",
    on_leave: "On leave",
    absent: "Absent",
    half_day: "Half-day",
    pendingApproval: "Pending approval",
    not_required: "Not required",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  },
  pages: {
    dashboard: {
      title: "{workspace} operations",
      description: "Today's attendance and the workload that needs a manager",
      employeeTitle: "Good to see you, {name}",
      employeeDescription: "Your attendance, leave, tasks and meetings at a glance",
      brief: "Daily brief",
    },
    inbox: {
      title: "Things needing attention",
      description: "Actions here update the source records directly. Use multi-select for bulk reviews.",
    },
    employees: {
      title: "Employees",
      description: "Manage active, pending, rejected, and deactivated memberships. Open a member profile to edit company information.",
    },
    attendance: { title: "Today's attendance", description: "Office and remote check-in for {date}." },
    leave: {
      title: "Review leave and half-day requests",
      description: "Review employee requests. Organization owners and managers do not submit leave requests for themselves.",
      employeeTitle: "Leave requests",
      employeeDescription: "Request full-day or half-day leave and track your balance.",
    },
    tasks: { title: "Taskboard", description: "Kanban board for tracking workspace tasks. Archived tasks stay in history." },
    calendar: { title: "Calendar", description: "Meetings, approved leave, and office holidays in one place." },
    performance: { title: "Performance index ranking", description: "Attendance and tracked hours for the selected period." },
    dailyReport: {
      eyebrow: "EOD Summary",
      title: "End-of-day summary",
      description:
        "Live during the day and automatically locked after the office end time. Later corrections are shown separately instead of silently changing the locked report.",
    },
    complaints: {
      eyebrow: "Issues",
      title: "Process employee issues",
      description: "Review employee-submitted issues and update their status.",
      employeeTitle: "Raise an issue",
      employeeDescription: "Report a workplace problem and follow its progress.",
    },
    settings: { title: "Workspace Settings", description: "Manage office hours, remote policy, and break schedules." },
    audit: { title: "Audit log", description: "Who did what and when across the workspace." },
    profile: { title: "My Profile", description: "Your personal details, attendance and security settings." },
  },
} as const;

export type Strings = typeof en;

type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];

export type StringKey = Path<Strings>;

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);
  const str = typeof value === "string" ? value : key;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
