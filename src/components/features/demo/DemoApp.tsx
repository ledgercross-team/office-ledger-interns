import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import { NAV, NAV_GROUPS, type NavItem } from "@/lib/nav";
import { NAV_ICONS } from "@/components/features/shell/icons";

type DemoPage =
  | "dashboard"
  | "inbox"
  | "employees"
  | "attendance"
  | "leave"
  | "tasks"
  | "calendar"
  | "performance"
  | "daily"
  | "complaints"
  | "settings"
  | "profile";

const DEMO_EMAIL = "manager@officeledger.test";
const DEMO_PASSWORD = "demo1234";

const people: [string, string, string, string, string][] = [
  ["Ava Thompson", "AT", "Design", "Present", "9:02 AM"],
  ["Marcus Reed", "MR", "Sales", "Remote", "9:11 AM"],
  ["Lena Ortiz", "LO", "Support", "Late", "9:34 AM"],
  ["Priya Nair", "PN", "Finance", "On leave", "—"],
  ["Sam Okafor", "SO", "Engineering", "Present", "8:58 AM"],
];

const pageMeta: Record<DemoPage, { label: string; eyebrow: string; description: string }> = {
  dashboard: {
    label: "Dashboard",
    eyebrow: "",
    description: "Today's attendance and the workload that needs a manager.",
  },
  inbox: {
    label: "Inbox",
    eyebrow: "Inbox",
    description: "Actions here update the source records directly. Use multi-select for bulk reviews.",
  },
  employees: {
    label: "Employees",
    eyebrow: "Manager reporting",
    description: "Manage active, pending, rejected, and deactivated memberships.",
  },
  attendance: {
    label: "Attendance",
    eyebrow: "Attendance",
    description: "Office and remote check-in for Monday, Oct 5.",
  },
  leave: {
    label: "Leave Requests",
    eyebrow: "Leave Requests",
    description:
      "Review employee requests. Organization owners and managers do not submit leave requests for themselves.",
  },
  tasks: {
    label: "Taskboard",
    eyebrow: "Taskboard",
    description: "Kanban board for tracking workspace tasks. Archived tasks stay in history.",
  },
  calendar: {
    label: "Calendar",
    eyebrow: "Calendar",
    description: "Meetings, approved leave, and office holidays in one place.",
  },
  performance: {
    label: "Performance",
    eyebrow: "Manager reporting",
    description: "Select a reporting timeline first, then inspect the ranking and apply compact filters.",
  },
  daily: {
    label: "Daily Report",
    eyebrow: "EOD Summary",
    description: "Live during the day and automatically locked after the office end time.",
  },
  complaints: {
    label: "Complaints",
    eyebrow: "Issues",
    description: "Review employee-submitted issues and update their status.",
  },
  settings: {
    label: "Settings",
    eyebrow: "Settings",
    description: "Manage office hours, remote policy, and break schedules.",
  },
  profile: {
    label: "My Profile",
    eyebrow: "SO UTHARDO",
    description: "Your employee profile and attendance history.",
  },
};

function Logo() {
  return (
    <span className="demo-logo">
      <span className="demo-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.5" />
          <path d="M16 8v8l5 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </span>
      <span>Office Ledger</span>
    </span>
  );
}

function Button({
  children,
  variant = "primary",
  icon: Icon,
  onClick,
  type = "button",
}: {
  children?: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "danger";
  icon?: LucideIcon;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`demo-button demo-button-${variant}`} onClick={onClick}>
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </button>
  );
}

function Avatar({ initials, tone = "blue" }: { initials: string; tone?: string }) {
  return <span className={`demo-avatar demo-avatar-${tone}`}>{initials}</span>;
}

function PageHero({ page, action }: { page: DemoPage; action?: ReactNode }) {
  const meta = pageMeta[page];
  return (
    <section className="demo-page-hero">
      <div>
        {meta.eyebrow && <p className="demo-eyebrow">{meta.eyebrow}</p>}
        <h1>{meta.label === "Dashboard" ? "Ledgercross operations" : meta.label}</h1>
        <p>{meta.description}</p>
      </div>
      {action}
    </section>
  );
}

function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`demo-panel ${className}`}>
      <div className="demo-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatStrip({
  items,
  children,
}: {
  items: { label: string; value: string; tone?: string }[];
  children?: ReactNode;
}) {
  return (
    <>
      <div className="demo-stat-grid">
        {items.map((item) => (
          <div className={`demo-stat demo-stat-${item.tone ?? "blue"}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {children}
    </>
  );
}

function Status({ value }: { value: string }) {
  const tone = value.toLowerCase().replace(" ", "-");
  return <span className={`demo-status demo-status-${tone}`}>{value}</span>;
}

function DashboardPage({ go }: { go: (page: DemoPage) => void }) {
  return (
    <div className="demo-page demo-dashboard">
      <PageHero
        page="dashboard"
        action={
          <Button icon={FileText} variant="outline" onClick={() => go("daily")}>
            Daily brief
          </Button>
        }
      />
      <div className="demo-dashboard-grid">
        <div className="demo-dashboard-main">
          <Panel title="Coverage" description="8 of 11 expected people checked in">
            <div className="demo-coverage-grid">
              <div>
                <div className="demo-coverage-value">
                  <span>CHECK-IN COVERAGE</span>
                  <strong>73%</strong>
                </div>
                <div className="demo-progress">
                  <i style={{ width: "73%" }} />
                </div>
              </div>
              <div>
                <div className="demo-coverage-value">
                  <span>WORKED RATE</span>
                  <strong>73%</strong>
                </div>
                <div className="demo-progress demo-progress-purple">
                  <i style={{ width: "73%" }} />
                </div>
              </div>
            </div>
            <div className="demo-mini-stat-grid">
              <div>
                <span>LATE</span>
                <strong>0</strong>
              </div>
              <div>
                <span>REMOTE</span>
                <strong>0</strong>
              </div>
              <div>
                <span>ON LEAVE</span>
                <strong>0</strong>
              </div>
              <div className="demo-mini-stat-danger">
                <span>ABSENT</span>
                <strong>3</strong>
              </div>
              <div>
                <span>PENDING TASKS</span>
                <strong>0</strong>
              </div>
              <div>
                <span>OPEN ISSUES</span>
                <strong>0</strong>
              </div>
            </div>
          </Panel>
          <a className="demo-inbox-banner" onClick={() => go("inbox")}>
            <span className="demo-inbox-icon">
              <Bell size={16} />
            </span>
            <span>
              <strong>159 updates need attention</strong>
              <small>Review joins, leave, attendance, and complaints.</small>
            </span>
            <span className="demo-link">Open inbox →</span>
          </a>
          <div className="demo-two-column">
            <Panel
              title="Attendance momentum"
              description="People checked in per day"
              action={<span className="demo-live-pill">● Live</span>}
            >
              <div className="demo-line-chart">
                <svg viewBox="0 0 540 160" preserveAspectRatio="none">
                  <path d="M0 28L42 142L84 138L126 126L168 118L210 113L252 128L294 118L336 117L378 112L420 46L462 34L540 52" />
                </svg>
              </div>
            </Panel>
            <Panel title="Operations mix" description="Distribution for today">
              <div className="demo-donut">
                <span>
                  8<strong>Present</strong>
                </span>
              </div>
              <div className="demo-legend">
                <span>
                  <i className="green" />
                  Present <b>8</b>
                </span>
                <span>
                  <i className="red" />
                  Absent <b>3</b>
                </span>
              </div>
            </Panel>
          </div>
        </div>
        <div className="demo-dashboard-side">
          <Panel
            title="Invite employees"
            description="Share this code with employees to request access."
            action={<span className="demo-key-icon">⌕</span>}
          >
            <div className="demo-invite-code">
              LEDGER-•••• <Button variant="outline">Copy code</Button>
            </div>
          </Panel>
          <Panel
            title="Attendance"
            action={
              <button className="demo-text-button" onClick={() => go("attendance")}>
                Full history
              </button>
            }
          >
            <div className="demo-checkin">
              <span>✓</span>
              <div>
                <strong>You're checked in</strong>
                <small>● Present · 09:40 AM</small>
              </div>
            </div>
          </Panel>
          <Panel title="Daily briefing" action={<Button variant="outline">Copy</Button>}>
            <div className="demo-briefing-stats">
              <span>
                <b>0</b>Meetings
              </span>
              <span>
                <b>0</b>Urgent tasks
              </span>
              <span>
                <b>0</b>Blocked
              </span>
            </div>
            <p className="demo-muted-copy">
              Copy a plain-text summary of today’s attendance, tasks, meetings, leave and issues.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function InboxPage() {
  const items = [
    ["Half-day request", "Raihan Al-Zakiy · EMP-13 · Software", "High"],
    ["Half-day request", "Mahfuz Ahmed · EMP-07 · Software", "Low"],
    ["Leave request", "Mahfuz Ahmed · MAN-02 · Software", "Low"],
  ];
  return (
    <div className="demo-page">
      <PageHero
        page="inbox"
        action={
          <>
            <span className="demo-count-pill">81 open</span>
            <Button icon={RefreshCw} variant="outline">
              Refresh
            </Button>
          </>
        }
      />
      <div className="demo-tabs">
        <button className="active">
          Decisions <b>4</b>
        </button>
        <button>
          Reviews <b>8</b>
        </button>
        <button>
          Exceptions <b>8</b>
        </button>
      </div>
      <div className="demo-bulkbar">
        <span>0 selected</span>
        <Button variant="outline">Select all</Button>
        <span className="demo-muted-copy">Clear</span>
      </div>
      <div className="demo-inbox-grid">
        {items.map(([title, subtitle, priority]) => (
          <article className="demo-request-card" key={subtitle}>
            <div className="demo-request-top">
              <input type="checkbox" aria-label={`Select ${title}`} />
              <strong>{title}</strong>
              <span>{priority}</span>
            </div>
            <p>{subtitle}</p>
            <p className="demo-request-copy">
              I have a personal appointment and need the request recorded for the office day.
            </p>
            <div className="demo-request-actions">
              <Button>Approve</Button>
              <Button variant="outline">Reject</Button>
              <button className="demo-text-button">Open source</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EmployeesPage({ go }: { go: (page: DemoPage) => void }) {
  return (
    <div className="demo-page">
      <PageHero
        page="employees"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <div className="demo-tabs">
        <button className="active">Active</button>
        <button>Pending</button>
        <button>Rejected</button>
      </div>
      <Panel
        title="Search and filters"
        description="Search by employee ID, name, email, phone, department, or designation."
      >
        <div className="demo-filters">
          <label>
            Search
            <input placeholder="⌕  Search employees" />
          </label>
          <label>
            Department
            <select>
              <option>All departments</option>
            </select>
          </label>
          <label>
            Designation
            <select>
              <option>All designations</option>
            </select>
          </label>
          <button className="demo-text-button">Clear filters</button>
        </div>
      </Panel>
      <Panel title="Employee list" description="12 employees in view across 3 departments.">
        <div className="demo-table-wrap">
          <table className="demo-table">
            <thead>
              <tr>
                {[
                  "ID",
                  "Name",
                  "Designation",
                  "Department",
                  "Joining date",
                  "Contact number",
                  "Role",
                  "Status",
                  "Email",
                  "",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "—",
                  "Shariful Kubria",
                  "Organization Owner",
                  "Unassigned",
                  "—",
                  "+8801759408407",
                  "Organization owner",
                  "Active",
                  "sharifulkubria77@gmail.com",
                ],
                [
                  "SOUHARDO",
                  "Souhardo Rahman",
                  "Developer",
                  "Software",
                  "Jan 2, 2026",
                  "+8801400443735",
                  "Manager",
                  "Active",
                  "dev.souhardo@gmail.com",
                ],
                [
                  "MIMOHIT",
                  "MI Mohit",
                  "Developer",
                  "Software",
                  "—",
                  "016344422521",
                  "Employee",
                  "Active",
                  "mimohit77@gmail.com",
                ],
                [
                  "SAFWAN",
                  "Nasif Safwan",
                  "Developer",
                  "Software",
                  "Feb 18, 2026",
                  "017899442475",
                  "Manager",
                  "Active",
                  "safwan@gmail.com",
                ],
                [
                  "SIAM",
                  "Ehsanul Haque",
                  "Developer",
                  "Software",
                  "—",
                  "+8801721199215",
                  "Employee",
                  "Active",
                  "ehsanul.siam@dev.com",
                ],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${index}`}>
                      {index === 1 ? (
                        <button className="demo-table-link" onClick={() => go("profile")}>
                          {cell}
                        </button>
                      ) : index === 7 ? (
                        <Status value={cell} />
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="demo-icon-button">
                      <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AttendancePage() {
  return (
    <div className="demo-page">
      <PageHero
        page="attendance"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <StatStrip
        items={[
          { label: "Present", value: "8", tone: "green" },
          { label: "Late", value: "0", tone: "purple" },
          { label: "Remote", value: "0", tone: "blue" },
          { label: "Checked out", value: "0", tone: "navy" },
        ]}
      />
      <Panel
        title="Your check-in"
        description="Choose Office or Remote. The system decides whether the check-in is on time or late."
      >
        <div className="demo-checkin-wide">
          <Status value="Present" />
          <span>
            Checked in at <strong>09:40 AM</strong>
          </span>
          <Button icon={LogOut} variant="outline">
            Check out
          </Button>
        </div>
      </Panel>
      <Panel title="Today's log" description="8 records for today.">
        <DemoAttendanceTable />
      </Panel>
    </div>
  );
}

function DemoAttendanceTable() {
  return (
    <div className="demo-table-wrap">
      <table className="demo-table">
        <thead>
          <tr>
            {["Employee", "Status", "Check in", "Approval", ""].map((head) => (
              <th key={head}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map(([name, initials, department, status, time]) => (
            <tr key={name}>
              <td>
                <span className="demo-name-cell">
                  <Avatar initials={initials} />
                  <span>
                    <strong>{name}</strong>
                    <small>{department}</small>
                  </span>
                </span>
              </td>
              <td>
                <Status value={status} />
              </td>
              <td>{time}</td>
              <td>{status === "Present" ? "Approved" : "—"}</td>
              <td>
                <button className="demo-icon-button">
                  <MoreHorizontal size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeavePage() {
  return (
    <div className="demo-page">
      <PageHero
        page="leave"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <div className="demo-tabs">
        <button className="active">Full-day leave</button>
        <button>Half-day requests</button>
      </div>
      <StatStrip
        items={[
          { label: "Pending", value: "3", tone: "purple" },
          { label: "Approved", value: "13", tone: "green" },
          { label: "Rejected", value: "2", tone: "red" },
          { label: "Total", value: "18", tone: "navy" },
        ]}
      />
      <Panel
        title="Manager view"
        description="Self-service leave forms are hidden for managers and organization owners."
      >
        <div className="demo-info-banner">
          Review employee requests below. Your own leave is not tracked here.
        </div>
      </Panel>
      <Panel
        title="Workspace requests"
        action={
          <div className="demo-filter-pills">
            <button className="active">Pending</button>
            <button>Approved</button>
            <button>Rejected</button>
            <button>All</button>
          </div>
        }
      >
        <article className="demo-leave-request">
          <div>
            <Status value="Pending" />
            <strong>Casual leave · 2026-09-16 to 2026-09-16</strong>
            <small>Requested by Mahfuz Ahmed · Software</small>
          </div>
          <p>I have a personal appointment and need the day recorded for the office.</p>
          <div>
            <Button>Approve</Button>
            <Button variant="outline">Reject</Button>
          </div>
        </article>
      </Panel>
    </div>
  );
}

function TasksPage() {
  const columns: [string, string, string[]][] = [
    [
      "To do",
      "3",
      [
        "Design onboarding checklist screens",
        "Quarterly vendor contract review",
        "Prepare security audit evidence",
      ],
    ],
    [
      "In progress",
      "3",
      ["Ship payroll export v2", "Usability study: mobile check-in", "Update employee handbook"],
    ],
    ["Blocked", "1", ["Fix timezone bug in leave calendar"]],
    ["Done", "1", ["Renew office internet contract"]],
  ];
  return (
    <div className="demo-page">
      <PageHero page="tasks" action={<Button icon={Plus}>New task</Button>} />
      <div className="demo-tabs">
        <button className="active">Active tasks</button>
        <button>Archived tasks</button>
      </div>
      <Panel title="Workspace tasks" action={<span className="demo-count-pill">8 active</span>}>
        <div className="demo-task-filters">
          <input placeholder="⌕  Search tasks..." />
          <select>
            <option>Anyone</option>
          </select>
          <select>
            <option>Any priority</option>
          </select>
          <select>
            <option>Any label</option>
          </select>
        </div>
        <div className="demo-kanban">
          {columns.map(([title, count, cards]) => (
            <div className="demo-kanban-column" key={title}>
              <div className="demo-kanban-heading">
                <span>
                  <i className={`demo-kanban-dot demo-kanban-${title.toLowerCase().replace(" ", "-")}`} />
                  {title} <b>{count}</b>
                </span>
                <Plus size={14} />
              </div>
              {cards.map((card) => (
                <article className="demo-task-card" key={card}>
                  <strong>{card}</strong>
                  <div>
                    <span className="demo-task-tag">Software</span>
                    <span className="demo-task-meta">◷ Oct 7</span>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CalendarPage() {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="demo-page">
      <PageHero
        page="calendar"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <div className="demo-tabs">
        <button>Meetings</button>
        <button>Approved leave</button>
        <button className="active">Holiday calendar</button>
      </div>
      <div className="demo-calendar-layout">
        <Panel title="Holiday calendar" description="Click a date to mark or request an office holiday.">
          <div className="demo-calendar-header">
            <button className="demo-icon-button">
              <ChevronLeft size={14} />
            </button>
            <strong>October 2026</strong>
            <button className="demo-icon-button">
              <ChevronRight size={14} />
            </button>
            <select>
              <option>October 2026</option>
            </select>
          </div>
          <div className="demo-weekdays">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="demo-calendar-grid">
            {days.map((day) => (
              <button
                className={
                  day === 5 ? "active" : [2, 3, 9, 10, 16, 17, 23, 24, 30, 31].includes(day) ? "weekend" : ""
                }
                key={day}
              >
                {day}
                {[2, 3, 9, 10, 16, 17, 23, 24, 30, 31].includes(day) && <small>Weekend</small>}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Selected day" description="Mon, Oct 5">
          <p className="demo-muted-copy">
            This is currently a working day unless it is a configured weekend or holiday.
          </p>
          <p className="demo-muted-copy">
            Click the date in the calendar to mark or remove an office holiday immediately.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function PerformancePage() {
  return (
    <div className="demo-page">
      <Panel
        title="How to read this page"
        description="This score is based on attendance and tracked working hours for the selected period. It is not a complete HR performance evaluation."
      />
      <PageHero
        page="performance"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <Panel
        title="Timeline selection"
        description="Choose the reporting period. The system automatically calculates office hours and expected working days from workspace settings."
      >
        <div className="demo-date-fields">
          <label>
            Start date
            <input value="10/01/2026" readOnly />
          </label>
          <label>
            End date
            <input value="10/31/2026" readOnly />
          </label>
          <Button icon={Eye}>View ranking</Button>
        </div>
        <div className="demo-info-banner">Current timeline: Oct 1, 2026 to Oct 31, 2026</div>
      </Panel>
      <StatStrip
        items={[
          { label: "Top performer", value: "Rimon Akon · 5.43%", tone: "purple" },
          { label: "Avg performance index", value: "3.92%", tone: "blue" },
          { label: "Avg productivity index", value: "7.83%", tone: "blue" },
        ]}
      />
      <Panel title="Compact filters" action={<button className="demo-text-button">Clear filters</button>}>
        <div className="demo-filters">
          <label>
            Search
            <input placeholder="⌕  Search employees" />
          </label>
          <label>
            Department
            <select>
              <option>All departments</option>
            </select>
          </label>
          <label>
            Designation
            <select>
              <option>All designations</option>
            </select>
          </label>
          <label>
            Rank by
            <select>
              <option>Performance index</option>
            </select>
          </label>
        </div>
      </Panel>
      <Panel title="Performance ranking table">
        <div className="demo-table-wrap">
          <table className="demo-table">
            <thead>
              <tr>
                {[
                  "Rank",
                  "Employee",
                  "Department",
                  "Attendance index",
                  "Productivity index",
                  "Performance index",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.slice(0, 4).map(([name, initials, department], index) => (
                <tr key={name}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="demo-name-cell">
                      <Avatar initials={initials} />
                      <strong>{name}</strong>
                    </span>
                  </td>
                  <td>{department}</td>
                  <td>{index === 0 ? "5.43%" : "3.92%"}</td>
                  <td>{index === 0 ? "7.83%" : "4.12%"}</td>
                  <td>
                    <strong>{index === 0 ? "5.43%" : "3.26%"}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function DailyReportPage() {
  return (
    <div className="demo-page">
      <PageHero
        page="daily"
        action={
          <Button icon={RefreshCw} variant="outline">
            Refresh
          </Button>
        }
      />
      <Panel
        title="Date and lock status"
        description="The locked snapshot is preserved. Official corrections after the lock are tracked separately."
      >
        <div className="demo-date-fields">
          <label>
            Date
            <input value="10/05/2026" readOnly />
          </label>
          <span className="demo-live-pill">Live preview</span>
          <span className="demo-muted-copy">Locks automatically after office end time</span>
        </div>
      </Panel>
      <Panel
        title="Attendance"
        description="Today's breakdown. Late, remote, and absent highlight only when there's something to notice."
      >
        <StatStrip
          items={[
            { label: "Expected", value: "11", tone: "navy" },
            { label: "Present (total)", value: "8", tone: "green" },
            { label: "Of which late", value: "0", tone: "purple" },
            { label: "Of which remote", value: "0", tone: "blue" },
            { label: "On leave", value: "0", tone: "purple" },
            { label: "Absent", value: "3", tone: "red" },
          ]}
        />
      </Panel>
      <StatStrip
        items={[
          { label: "Pending reviews", value: "0", tone: "purple" },
          { label: "Open tasks", value: "0", tone: "navy" },
          { label: "Open complaints", value: "0", tone: "red" },
          { label: "Corrections", value: "0", tone: "blue" },
        ]}
      />
      <Panel
        title="Operational details"
        description="These values come from the same SQL resolver used by the Performance index."
      >
        <div className="demo-detail-list">
          <span>
            Worked <b>8</b>
          </span>
          <span>
            Half-days <b>0</b>
          </span>
          <span>
            Missing checkout <b>8 records</b>
          </span>
          <span>
            Meetings <b>0 scheduled</b>
          </span>
          <span>
            Holidays <b>0 active</b>
          </span>
        </div>
      </Panel>
    </div>
  );
}

function ComplaintsPage() {
  return (
    <div className="demo-page">
      <PageHero page="complaints" />
      <Panel title="Issue tracker" description="Move items from new → reviewing → resolved.">
        <StatStrip
          items={[
            { label: "New", value: "0", tone: "red" },
            { label: "Reviewing", value: "0", tone: "purple" },
            { label: "Resolved", value: "0", tone: "green" },
            { label: "Total", value: "0", tone: "navy" },
          ]}
        />
      </Panel>
      <Panel title="Open issues" description="0 unresolved reports">
        <div className="demo-empty">
          <MessageIcon />
          <strong>No open issues</strong>
          <span>New reports will appear here immediately.</span>
        </div>
      </Panel>
    </div>
  );
}

function MessageIcon() {
  return <span className="demo-empty-icon">□</span>;
}

function SettingsPage() {
  return (
    <div className="demo-page">
      <PageHero page="settings" />
      <div className="demo-readonly">
        You are viewing settings in read-only mode. Only the organization owner can change office settings.
      </div>
      <StatStrip
        items={[
          { label: "Office window", value: "10:00:00–18:00:00", tone: "blue" },
          { label: "Late threshold", value: "15 min", tone: "purple" },
          { label: "Weekend days", value: "2", tone: "blue" },
          { label: "Approval", value: "Open", tone: "navy" },
        ]}
      />
      <div className="demo-tabs">
        <button className="active">Policy</button>
        <button>Schedule</button>
      </div>
      <Panel
        title="Core policy"
        description="Set the operating window, remote allowance, and approval strictness."
      >
        <div className="demo-settings-form">
          <label>
            Office start time
            <input value="10:00 AM" readOnly />
          </label>
          <label>
            Office end time
            <input value="06:00 PM" readOnly />
          </label>
          <label>
            Late threshold (minutes)
            <input value="15" readOnly />
          </label>
          <label>
            Remote days per week
            <input value="0" readOnly />
          </label>
          <label>
            Manager approval for late / remote
            <select>
              <option>Not required</option>
            </select>
          </label>
        </div>
      </Panel>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="demo-page">
      <section className="demo-profile-header">
        <div className="demo-profile-identity">
          <Avatar initials="SO" tone="purple" />
          <div>
            <p className="demo-eyebrow">SOUHARDO</p>
            <h1>Souhardo Rahman</h1>
            <div>
              <span className="demo-tag">Developer</span>
              <span className="demo-tag">Software</span>
            </div>
          </div>
        </div>
        <div className="demo-profile-contact">
          <strong>CONTACT</strong>
          <span>✉ dev.souhardo@gmail.com</span>
          <span>♧ +8801400443735</span>
        </div>
        <div className="demo-profile-contact">
          <strong>PERSONAL</strong>
          <span>⌂ No address added</span>
          <span>♙ Blood group O+</span>
        </div>
        <div className="demo-profile-contact">
          <strong>EMPLOYMENT</strong>
          <span>◷ Joined Jan 2, 2026</span>
          <span>◫ 9 months 3 days with the company</span>
        </div>
        <StatStrip
          items={[
            { label: "Attendance days", value: "42", tone: "blue" },
            { label: "Worked hours", value: "60h 44m", tone: "blue" },
            { label: "Completed days", value: "7", tone: "navy" },
            { label: "Issues", value: "0", tone: "navy" },
          ]}
        />
      </section>
      <Panel title="Employment summary" description="Core employment, attendance, and issue totals.">
        <StatStrip
          items={[
            { label: "Tenure", value: "9 months 3 days", tone: "navy" },
            { label: "Attendance days", value: "42", tone: "blue" },
            { label: "Complaints", value: "0", tone: "navy" },
            { label: "Completed days", value: "7", tone: "navy" },
          ]}
        />
      </Panel>
      <Panel title="Working hours" description="Tracked work time from completed attendance records.">
        <StatStrip
          items={[
            { label: "Total worked", value: "60h 44m", tone: "blue" },
            { label: "Average per day", value: "8h 41m", tone: "blue" },
            { label: "Most recent check in", value: "Oct 5, 2026, 09:40 AM", tone: "navy" },
            { label: "Most recent check out", value: "Oct 4, 2026, 06:01 PM", tone: "navy" },
          ]}
        />
        <DemoAttendanceTable />
      </Panel>
    </div>
  );
}

function DemoPageContent({ page, go }: { page: DemoPage; go: (page: DemoPage) => void }) {
  switch (page) {
    case "dashboard":
      return <DashboardPage go={go} />;
    case "inbox":
      return <InboxPage />;
    case "employees":
      return <EmployeesPage go={go} />;
    case "attendance":
      return <AttendancePage />;
    case "leave":
      return <LeavePage />;
    case "tasks":
      return <TasksPage />;
    case "calendar":
      return <CalendarPage />;
    case "performance":
      return <PerformancePage />;
    case "daily":
      return <DailyReportPage />;
    case "complaints":
      return <ComplaintsPage />;
    case "settings":
      return <SettingsPage />;
    case "profile":
      return <ProfilePage />;
  }
}

function DemoLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      setError("Use the demo credentials shown below.");
      return;
    }
    sessionStorage.setItem("office-ledger-demo", "1");
    onLogin();
  };
  return (
    <div className="demo-login-page">
      <div className="demo-login-glow" />
      <div className="demo-login-card">
        <div className="demo-login-brand">
          <Logo />
        </div>
        <p className="demo-login-eyebrow">Interactive frontend demo</p>
        <h1>Welcome back</h1>
        <p className="demo-login-subtitle">
          Explore the Office Ledger workspace with a safe, local-only demo account.
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <span className="demo-password-field">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <Eye size={15} /> : <ChevronDown size={15} />}
              </button>
            </span>
          </label>
          {error && (
            <p className="demo-login-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit">
            Open demo workspace <ChevronRight size={14} />
          </Button>
        </form>
        <div className="demo-credentials">
          <span>Demo credentials</span>
          <strong>{DEMO_EMAIL}</strong>
          <strong>{DEMO_PASSWORD}</strong>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              setError("");
            }}
          >
            Use demo account
          </button>
        </div>
        <a href="/" className="demo-back-link">
          ← Back to Office Ledger
        </a>
      </div>
    </div>
  );
}

export default function DemoApp() {
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState<DemoPage>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => setSignedIn(sessionStorage.getItem("office-ledger-demo") === "1"), []);
  const current = pageMeta[page];
  const grouped = useMemo(
    () => NAV_GROUPS.map((group) => ({ ...group, items: NAV.filter((item) => item.group === group.key) })),
    [],
  );
  const logout = () => {
    sessionStorage.removeItem("office-ledger-demo");
    setSignedIn(false);
  };
  const go = (next: DemoPage) => {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (!signedIn) return <DemoLogin onLogin={() => setSignedIn(true)} />;
  return (
    <div className="demo-shell">
      <div className={`demo-backdrop ${mobileNav ? "is-open" : ""}`} onClick={() => setMobileNav(false)} />
      <aside className={`demo-sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className="demo-sidebar-top">
          <Logo />
          <button className="demo-sidebar-collapse" aria-label="Collapse navigation">
            ‹
          </button>
        </div>
        <div className="demo-workspace">Ledgercross</div>
        <nav>
          {grouped.map((group) => (
            <div className="demo-nav-group" key={group.key}>
              <p>{group.label}</p>
              <ul>
                {group.items.map((item: NavItem) => {
                  const Icon = NAV_ICONS[item.icon];
                  const key = item.key === "daily" ? "daily" : (item.key as DemoPage);
                  return (
                    <li key={item.key}>
                      <button className={page === key ? "active" : ""} onClick={() => go(key)}>
                        <Icon size={14} aria-hidden />
                        <span>{item.label}</span>
                        {item.key === "inbox" && <b className="demo-nav-badge">81</b>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="demo-sidebar-bottom">
          <button onClick={() => go("profile")} className={page === "profile" ? "active" : ""}>
            ◯ <span>My Profile</span>
          </button>
          <div className="demo-user">
            <Avatar initials="SO" />
            <span>
              <strong>Souhardo Rahman</strong>
              <small>Manager</small>
            </span>
            <button onClick={logout} aria-label="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>
      <div className="demo-main">
        <header className="demo-topbar">
          <button
            className="demo-mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <strong>{current.label}</strong>
          <div className="demo-topbar-actions">
            <button className="demo-search">
              <Search size={14} /> Search <kbd>⌘ K</kbd>
            </button>
            <button className="demo-icon-button" aria-label="Announcements">
              <Bell size={15} />
            </button>
            <button className="demo-icon-button" aria-label="Account">
              <Avatar initials="SO" />
            </button>
            <button className="demo-top-user" onClick={logout}>
              Souhardo <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main className="demo-content">
          <DemoPageContent page={page} go={go} />
        </main>
      </div>
    </div>
  );
}
