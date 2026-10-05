import type { WorkspaceContext } from "./auth-types";
import { can, type Action } from "./permissions";
import { en } from "@/i18n/en";

export type NavIcon =
  | "dashboard"
  | "inbox"
  | "employees"
  | "attendance"
  | "leave"
  | "tasks"
  | "calendar"
  | "performance"
  | "report"
  | "complaints"
  | "settings"
  | "profile";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  group: "main" | "operations" | "reports" | "workspace";
  requires?: Action;
}

export const NAV: NavItem[] = [
  { key: "dashboard", label: en.nav.dashboard, href: "/app", icon: "dashboard", group: "main" },
  { key: "inbox", label: en.nav.inbox, href: "/app/inbox", icon: "inbox", group: "main", requires: "inbox.view" },
  { key: "employees", label: en.nav.employees, href: "/app/employees", icon: "employees", group: "main", requires: "employees.view" },
  { key: "attendance", label: en.nav.attendance, href: "/app/attendance", icon: "attendance", group: "operations" },
  { key: "leave", label: en.nav.leave, href: "/app/leave", icon: "leave", group: "operations" },
  { key: "tasks", label: en.nav.tasks, href: "/app/tasks", icon: "tasks", group: "operations" },
  { key: "calendar", label: en.nav.calendar, href: "/app/calendar", icon: "calendar", group: "operations" },
  { key: "performance", label: en.nav.performance, href: "/app/performance", icon: "performance", group: "reports" },
  { key: "daily", label: en.nav.dailyReport, href: "/app/reports/daily", icon: "report", group: "reports", requires: "report.view" },
  { key: "complaints", label: en.nav.complaints, href: "/app/complaints", icon: "complaints", group: "workspace" },
  { key: "settings", label: en.nav.settings, href: "/app/settings", icon: "settings", group: "workspace", requires: "settings.view" },
];

export const NAV_GROUPS = [
  { key: "main", label: en.nav.main },
  { key: "operations", label: en.nav.operations },
  { key: "reports", label: en.nav.reports },
  { key: "workspace", label: en.nav.workspace },
] as const;

export const navFor = (ctx: WorkspaceContext) => NAV.filter((n) => !n.requires || can(ctx, n.requires));

export function isActive(href: string, pathname: string) {
  if (href === "/app") return pathname === "/app" || pathname === "/app/";
  return pathname === href || pathname.startsWith(href + "/");
}
