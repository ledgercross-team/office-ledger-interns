import {
  BarChart3,
  CalendarDays,
  Clock3,
  FileText,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MessageSquareWarning,
  Plane,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

/** Mirrors the app's screens (used by the landing page and /features). */
export const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    text: "Check-in coverage, worked rate, a 7/30/90-day attendance trend, who's out, and a copy-ready daily brief.",
    points: [
      "Manager and employee views",
      "Invite code with copy and regenerate",
      "Birthdays, anniversaries and holidays",
    ],
  },
  {
    icon: Inbox,
    title: "Inbox",
    text: "Joins, leave, half-days, late or remote check-ins, corrections, holiday proposals and complaints in one queue.",
    points: [
      "Bulk approve and reject",
      "Keyboard triage with J, K, A and R",
      "Exceptions such as missing checkouts",
    ],
  },
  {
    icon: Clock3,
    title: "Attendance",
    text: "Office or remote check-in with late rules taken from your settings, plus breaks and correction requests.",
    points: [
      "Optional office IP or location check",
      "Auto-checkout with missing-checkout flags",
      "Approval for late or remote work",
    ],
  },
  {
    icon: Plane,
    title: "Leave requests",
    text: "Full-day and half-day leave with balances and accrual. Approved leave updates the calendar and attendance.",
    points: [
      "Configurable types and quotas",
      "Warnings when a department overlaps",
      "Attachments such as medical notes",
    ],
  },
  {
    icon: KanbanSquare,
    title: "Taskboard",
    text: "A drag-and-drop kanban with checklists, comments, @mentions and attachments.",
    points: ["List and My tasks views", "Due-soon reminders", "History of archived tasks"],
  },
  {
    icon: CalendarDays,
    title: "Calendar",
    text: "Meetings with RSVP, approved leave and the office holiday calendar, with an iCal feed for every member.",
    points: ["Recurring meetings", "Owner approval for holidays", "Public holiday import"],
  },
  {
    icon: BarChart3,
    title: "Performance index",
    text: "A transparent score built from attendance penalties and tracked hours, with trends against the previous period.",
    points: ["Penalty points you control", "CSV and PDF export", "Employees see only their own score"],
  },
  {
    icon: FileText,
    title: "Daily report",
    text: "A live end-of-day summary that locks at office close. Later corrections are listed separately.",
    points: ["Weekly and monthly roll-ups", "Emailed to managers", "Copy as plain text or print"],
  },
  {
    icon: Users,
    title: "Employees",
    text: "Profiles with attendance heatmaps, working hours, leave balances and a private document vault.",
    points: ["CSV import and export", "Org chart", "Email invites with pre-set roles"],
  },
  {
    icon: MessageSquareWarning,
    title: "Complaints",
    text: "Issues move from new to reviewing to resolved, with internal notes and an optional anonymous mode.",
    points: ["Severity and assignee", "Status history", "Resolution sent to the submitter"],
  },
  {
    icon: Settings,
    title: "Settings",
    text: "Office hours, late threshold, remote policy, weekends, breaks, leave types and scoring, with every change audited.",
    points: ["Read-only view for managers", "Full data export", "Audit log"],
  },
  {
    icon: ShieldCheck,
    title: "Security",
    text: "Role-based access enforced on the server, Postgres row-level security, strict CSP and two-factor sign-in.",
    points: ["Argon2id passwords and lockout", "Signed, expiring file links", "Rate limiting"],
  },
];
