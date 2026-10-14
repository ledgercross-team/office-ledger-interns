# Office Ledger HRMS: UI Specification

The design and behaviour contract for the HRMS frontend. Claude Code reads this file before every UI step. Requirements come from `plan-v3.md`; the API is what `RUNBOOK.md` built. Where this spec and the plan disagree, the plan wins.

---

## 1. Goal

Every backend capability is **visible, reachable and usable** by the right role, in a clean SaaS dashboard that works on a phone, a laptop and a wide monitor. Nobody should need to know a URL, read a log, or use curl to do anything the plan allows.

Principles, in priority order:
1. **Correct for the role.** People see only what their role can do. The server is still the judge: the UI hides, the API refuses.
2. **Clear next step.** Every page has one obvious primary action. Every waiting item says who it is waiting on.
3. **Honest feedback.** Every action shows pending, success and failure. Database rule messages (HTTP 409) are shown word for word.
4. **Calm and consistent.** One spacing scale, one type scale, one set of components, used the same way everywhere.
5. **Accessible by default.** WCAG 2.2 AA on every page.

## 2. Stack and constraints

- Use the stack already in the repo: Next.js (App Router), React, Tailwind CSS, TanStack Query, the existing `frontend/src/lib/hrms/api-client.ts` and auth context. Do not add a second styling system or state library.
- Check `frontend/package.json` before adding anything. If a primitive is missing (accessible dialog, popover, menu, toast, date picker, icons), **list the package you want and why, and wait for approval.** Prefer one headless primitive library (for example Radix UI) and one icon set (for example lucide-react) over many small packages.
- Reuse existing components where they fit (`stat-tile`, `pagination`, `timezone-select`, `date-input`, `status-badge`, `task-card`, `task-action-bar`, `check-in-card`, `attendance-chart`, `correction-dialog`, `open-task-list`, `overdue-list`). Move them into the new design system rather than keeping two versions.
- **Do not change the backend.** If a screen needs data the API does not provide, list it under "API gaps" in your report.
- `APP_BASE` below means the real frontend prefix (`/hrms` or `/`, whichever the repo uses now). `API` means the real API prefix (`/api` or `/api`).

## 3. Design tokens

Define tokens once as CSS variables (Tailwind 4 `@theme`), with light and dark values. Components use tokens only, never raw hex values.

**Colour (semantic names):**

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-raised`, `surface-sunken` | Page, cards, popovers, inputs and table stripes |
| `border`, `border-strong` | Dividers, input outlines |
| `fg`, `fg-muted`, `fg-subtle` | Body text, secondary text, placeholders |
| `primary`, `primary-fg`, `primary-soft` | Brand accent: primary buttons, links, active nav, focus ring |
| `success`, `warning`, `danger`, `info` (+ `-soft`, `-fg`) | Status colours |

- One brand accent only. Neutral greys carry the layout; colour carries meaning.
- Every text/background pair meets 4.5:1 (3:1 for large text and UI outlines). Check both themes.
- Dark mode follows the system and can be overridden in the user menu (saved per browser).

**Type scale:** 12, 13, 14 (body), 16, 18, 20, 24, 30. Line height 1.5 for body, 1.25 for headings. Use the font the app already loads via `next/font`; otherwise Inter. Tabular numbers (`tabular-nums`) for every number in tables, tiles and timers.

**Spacing:** 4px grid only (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Card padding 20 or 24. Gap between page sections 24 (mobile) or 32 (desktop).

**Shape and depth:** radius 6 (inputs, buttons), 10 (cards, dialogs), full (badges, avatars). Prefer 1px borders over heavy shadows; one soft shadow for popovers and dialogs.

**Motion:** 150ms for hover and press, 200ms for popovers and toasts, 250ms for drawers and dialogs, `ease-out` in, `ease-in` out. Animate only `opacity` and `transform`. Under `prefers-reduced-motion: reduce`, replace movement with a fade or nothing.

**Breakpoints:** `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Content max width 1280 for dashboards, 768 for forms and settings.

## 4. Component library

Build these once in `frontend/src/components/ui/` (or the repo's existing UI folder) with every state listed. A dev-only gallery page shows each one in light and dark.

| Component | States and rules |
|---|---|
| Button | primary, secondary, ghost, danger; sm/md; loading (spinner, keeps width, disabled), disabled with reason tooltip; icon-only needs `aria-label` |
| Input, Textarea, Select, Combobox, Checkbox, Radio, Switch | label always visible, helper text, inline error under the field, required mark, disabled |
| DatePicker, DateRangePicker (half-day aware), TimeInput, TimezoneSelect | keyboard usable; shows the user's time zone |
| Badge / StatusPill | always icon + text, never colour alone (see §9) |
| Avatar, AvatarStack | initials fallback, role ring optional |
| Card, StatTile (value, label, delta, link), ProgressBar (animated width, text label) | |
| DataTable | sortable headers (`aria-sort`), sticky header, row selection with bulk bar, column visibility on small screens, skeleton rows, empty state, error state with retry, pagination. Below `md`, rows render as stacked cards |
| Tabs, SegmentedControl, Breadcrumbs, Pagination | |
| Dialog, ConfirmDialog, ReasonDialog, Drawer (right side, full screen on mobile) | focus trapped, Esc closes, focus returns to the trigger |
| DropdownMenu, Popover, Tooltip | keyboard and screen reader friendly |
| Toast | success, error, info; `aria-live="polite"` (errors `assertive`); undo action where the API allows |
| EmptyState (icon, title, one line, primary action), ErrorState (message, retry), Skeleton | |
| Banner (info, warning, danger) | for org status and seat warnings; dismissible only when the condition is informational |
| PageHeader | title, one-line description, primary action on the right, secondary actions in a menu; stacks on mobile |
| FilterBar | search, filter chips, clear all; state kept in the URL query string |
| WorkloadChip, ScoreBadge, UrgencyTag, FlagTag, LeaveTag | see §9 |
| CommandPalette (Ctrl/Cmd + K) | jump to any page the role can see; search people, projects and tasks through existing list endpoints |

**ReasonDialog** is used for every action that needs a reason: reject a request, decline an invite, overrule a decline, block a task, cancel a task, send back for review, reopen a task, low ratings (1 or 2 stars), block an org. The submit button stays disabled until the reason has text.

**ConfirmDialog** is used for actions that are hard to undo: archive a project, deactivate or suspend a member, remove from a project, cancel a meeting, downgrade plan, block an org. It names the object ("Archive *Website redesign*? Its 4 open tasks will be cancelled.").

## 5. App shell and navigation

**Layout:** left sidebar + top bar + content.
- **Sidebar (lg and up):** logo, org name, role-based nav (§6) with icons and count badges (requests to decide, invites, ratings due), collapse to icons. Below `lg` it becomes a drawer opened from the top bar. Mobile also gets a bottom tab bar with the 4 most-used items for the role.
- **Top bar:** page breadcrumbs, command palette button, **quick check-in** button (shows Check in / Check out / Checked out 17:42), notification bell with unread count and a dropdown of the latest 10, user menu.
- **User menu:** name, email, role in the current org, **Switch organisation** (lists memberships), Profile, Security (password, MFA), Email preferences, theme, Sign out.
- **Org status banners** (top of content, every page): `read_only` warning ("This organisation is read-only until the subscription is renewed. You can view but not change anything."); `suspended` danger, CEO/COO only can be here; seat warning at 80/95/100% for CEO and COO, linking to People.
- **Read-only mode:** every mutating control is disabled with a tooltip explaining why. Do not hide them, so people understand what is blocked.
- Skip-to-content link, one `<h1>` per page, landmarks (`nav`, `main`, `header`).

## 6. Navigation by role

| Item | CEO | COO | Manager | Employee |
|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Requests (inbox) | ✓ | ✓ | ✓ | ✓ (mine) |
| Projects | all | all | assigned (all if granted) | mine |
| Tasks | ✓ | ✓ | ✓ | My tasks |
| Invites | declines to review | declines to review | to me + to review | to me |
| People | ✓ | ✓ | people on shared projects | – |
| Attendance | everyone | everyone | me + people on my projects | me |
| Leave | ✓ (+ to decide) | ✓ (+ to decide) | ✓ (+ to decide if lead) | ✓ |
| Calendar | everyone | everyone | me + people on my projects | me |
| Workload | ✓ | ✓ | people on my projects | – |
| Performance | ✓ | ✓ | – | – |
| History (audit) | ✓ + notes | ✓ | – | – |
| Settings (org) | edit | view | – | – |

The **gameMaster** gets a separate shell under `APP_BASE/platform` with only: Organisations, Platform requests, GameMasters, Security. It never links to org pages.

## 7. Pages

For every page: loading skeleton matching the final layout, empty state with a helpful action, error state with retry, and correct behaviour on a 375px screen.

### Auth and account
- **Login:** email, password, show/hide password, "Forgot password", inline error on 401 ("Email or password is incorrect"), rate-limit message on 429 with the wait time. After login: one membership goes straight in; several show the **organisation picker** (org name, role, status pill; blocked orgs disabled with reason). gameMasters go to the platform console.
- **MFA:** enrolment (QR code, manual key, 6-digit code with auto-advance boxes, backup guidance) forced on first login for gameMaster, CEO and COO; verify screen on later logins.
- **Accept invite / reset password / CEO recovery link:** set password with strength meter and rules shown up front; expired or used link shows a clear page with who to contact.
- **Blocked, suspended (non-CEO/COO), 403, 404, 500:** friendly full-page states with a way back.

### Dashboard (different per role)
- **CEO / COO:** stat tiles (seats used of limit with bar and warning state, requests waiting on you, active projects, overdue tasks, present / late / absent today, on leave today). Panels: requests waiting on you (top 5 with inline approve and reject), projects needing attention (No manager, No employee, pending lead approval), overdue tasks, people on leave this week, performance band summary (counts per band, link to Performance).
- **Manager:** my projects with progress bars and flags, tasks in review waiting on me, overdue tasks in my projects, requests to decide (if lead), declined invites to review, team workload chips, today's check-in card, upcoming meetings.
- **Employee:** check-in card, my tasks sorted by urgency then due date, invites waiting on me, ratings due, upcoming meetings and holidays, leave balance summary.

### People (CEO, COO, managers)
- Table: name, designation, role, projects count, workload chip, status, last login; CEO/COO also see the performance score column. Filters: role, status, project, workload colour. Bulk actions for CEO: suspend (from downgrade list).
- **Add person** (CEO/COO): email, name, role, designation; if the email already exists, say "This person already has an account. They will be added to this organisation." Seat bar shown in the dialog; at the limit the button is disabled with the reason. Managers see "Request a new user" which files a `create_user` request.
- **Person detail:** header (avatar, name, role, status, workload, on-leave tag), tabs: Overview (profile fields, editable by who may), Projects, Tasks, Attendance, Leave, Performance (CEO/COO). Actions: change role, toggle approval switch, grant org-wide project visibility, deactivate (CEO/COO), all with confirmation.
- **Downgrade candidates** (CEO): sorted by longest since last login, multi-select, suspend with a summary of seats freed.

### Projects
- List: cards or table toggle; name, progress bar with "18 of 24 tasks done · 75%" (or "No tasks yet"), managers with lead badge, employees count, flags, status pill. Archived projects grey, at the end. Filters: status, flag, mine.
- **New project:** CEO creates directly; COO sees "Request project" which files `create_project`.
- **Project detail** with tabs: Overview (description, progress, flags, completion panel), Tasks (the task list scoped to this project), People (managers with lead toggle for CEO/COO, employees, pending invites, remove), Activity (status history from the API).
- **Invite employee:** CEO/COO directly; a manager files `add_to_project` (or uses an approved one, shown as "Ready to invite").
- **Completion panel:** checklist of managers with tick state; "Tick as done" for a manager when all tasks are closed (disabled with reason otherwise); "Approve completion" for a lead (or CEO/COO when no lead); "Send back" with reason. After completion: "Completed" banner and a lock note; CEO/COO see "Reopen".
- Archive (CEO only) with a confirm that states how many open tasks will be cancelled.

### Invites
- **To me:** project, inviter, message, Accept / Decline (reason required).
- **To review (inviter):** declined invites with the employee's reason; Accept decline or Overrule (reason required, shown to the employee).

### Tasks
- Views: **List** (default, grouped or sorted by urgency then due date) and **Board** (columns per status; drag only to statuses the API allows for this person; otherwise use the action menu). Filters: project, mine, status, urgency, overdue, flag.
- Row/card: title, project, urgency tag, due date (red and "Overdue" when past), assignees avatar stack, status pill, flags.
- **Create task:** project, title, description, urgency (required), due date (required), managers and employees pickers limited to project members with workload chips and an on-leave warning. If the manager's approval switch is on, the button says "Request task" and files `create_task`; an approved request pre-fills the form.
- **Task detail drawer:** status pill and the **next allowed actions as buttons** (Start, Send for review, Mark done, Send back, Block, Unblock, Cancel, Reopen) with reason dialogs where needed; assignees with add/remove; due date and urgency edit; status history timeline. Assigning someone outside the project offers "Request add to project and assign".

### Requests (inbox)
- Tabs: **Waiting on me** (count) and **Mine**. Filters: type, project, requester, status.
- Each item: type icon and label in plain words ("Add Rahim to Website redesign"), requester, age and expiry ("Expires in 2 working days"), context (seats left for `create_user`, workload for assignments), status pill.
- Actions: Approve, Reject (reason), Cancel (mine, pending). **Bulk** select with approve/reject bar. After approval, the requester sees the follow-up button ("Send invite", "Create the task", "Assign").
- When the database refuses ("You cannot approve your own request"), show that message in a toast and keep the item.

### Attendance
- **Me:** large check-in card (status, time in, time out, hours; disabled with the reason when off the office network), month calendar coloured by status with a legend (icon + text), totals, "Request correction" per day.
- **Team (CEO/COO/manager):** person picker or table by day; month filter; export CSV button.
- Correction dialog: date, corrected times, reason; shows "Pending approval" afterwards; approved corrections show the original struck through with the correction.

### Leave
- Balance cards per leave type (used / allowance, remaining).
- Request form: type, date range with half-day options, reason; live working-day count; over-allowance warning ("This will exceed your Annual balance by 2 days and count as unpaid").
- My leave history with statuses and Cancel (before start) or "Request change" (after start).
- **To decide** (approvers): list with requester, dates, days, balance, overlap warning, approve/reject.

### Calendar and meetings
- Month, week and agenda views; shows task due dates, meetings, approved leave and holidays with distinct icons and a legend. Times in the viewer's time zone (shown in the header).
- Filter by person (CEO/COO all; managers people on their projects).
- **New meeting** (CEO/COO/manager): title, date and time, duration, invitees picker (same org), online (link, validated URL) **or** in person (location); the form enforces one of the two. Invitees can Accept or Decline; creator can edit or cancel.

### Workload (CEO, COO, managers)
- Table or card grid: person, chip (green/amber/red), "4 active tasks across 3 projects", shared project names for managers, "On leave until 12 Nov" tag. Sort by load. Thresholds shown in a legend.

### Ratings and performance
- **Ratings due:** after a project completes, a dialog/page per project lists the people to rate with 1–5 stars; 1 or 2 stars require a comment; one submit for the batch; a note that ratings are anonymous and count only after 3. Shows the days left in the 7-day window.
- **Performance** (CEO/COO only): table with score "81 / 100" coloured by band, band label, trend arrow, "New" and "No ratings yet" labels. Click opens a breakdown drawer: attendance (on time, late, absent, missing check-out, leave), rating average and count, on-time tasks, and the weights used.

### Notifications
- Bell dropdown and a full page: grouped by day, unread highlighted, mark one or all read (optimistic), each links to its object.
- **Email preferences:** toggles per category; "Requests waiting on your decision" is always on and shown disabled with the reason.

### History (audit)
- CEO/COO: filterable table (who, what, object, when, from where), entry detail drawer with the original data and notes; CEO adds a note (original never editable).

### Settings (CEO edits, COO views)
Sections in a left sub-nav: General (name, time zone, work start, grace minutes, weekend days), Office networks (IP/CIDR list with validation and "Add my current IP"), Holidays (list + add), Leave types (allowances, add type), Workload thresholds, Performance weights and points, Approvals (each manager's approval switch and org-wide visibility), Subscription (plan, seats, status, renewal info), Data export (CEO; available while suspended), Recovery (COO: request CEO recovery; CEO: request last-CEO removal).

### Platform console (gameMaster)
- **Organisations:** table with name, plan, seats used, status, CEO+COO count with a warning icon over 25; create org (name, plan, first CEO email and name); block/unblock (reason); change plan (refusal message shown when over the new limit).
- **Platform requests:** CEO recovery and last-CEO removal; verify (with an "I verified this offline" checkbox and notes) and complete.
- **GameMasters:** list, create (pending), confirm (disabled for the creator, with the reason).
- No screen shows any org's people, projects or tasks.

## 8. Data, state and feedback

- **Queries:** TanStack Query with stable keys per resource (`['tasks', filters]`, `['task', id]`). After a mutation, invalidate the exact keys it affects (for example approving a request refreshes requests, the badge count and the object it applies to).
- **Optimistic updates** only where safe and reversible: mark notification read, tick project done, invite accept. Roll back on error.
- **Errors:** map API errors once in the api client. 409 shows the server message as is. 422 shows field errors inline. 403 shows "You don't have permission to do that." 401 triggers the existing refresh flow, then login. 429 shows the wait time. 500 shows a generic message with a retry.
- **Forms:** validate on blur and on submit; keep the user's input after a server error; disable submit while pending; Enter submits single-field dialogs.
- **Lists:** filters, sort, page and tab live in the URL so links and the back button work.
- **Dates:** stored UTC, shown in the user's time zone; relative times ("2 hours ago") with the full date in a tooltip.
- No `console` noise and no secrets or tokens in the browser beyond the httpOnly cookies.

## 9. Status vocabulary (icon + text + colour)

| Thing | Values and colour |
|---|---|
| Task status | To do (neutral), In progress (info), In review (primary), Done (success), Blocked (danger), Cancelled (neutral, struck) |
| Urgency | High (danger), Medium (warning), Low (neutral) |
| Request status | Pending (warning), Approved (info), Applied (success), Rejected (danger), Cancelled (neutral), Expired (neutral) |
| Project status | Active (info), Pending lead approval (warning), Completed (success), Archived (neutral) |
| Attendance day | Present (success), Late (warning), Missing check-out (warning), On leave (info), Holiday (neutral), Weekend (neutral), Absent (danger) |
| Workload | Green, Amber, Red, plus "On leave until …" |
| Performance band | Excellent 85+ (success), Good 70–84 (info), Needs attention 50–69 (warning), Poor <50 (danger), New, No ratings yet (neutral) |
| Org status | Active, Read-only, Suspended, Blocked |
| Flags | No manager, No employee, No assignee, Overdue |

Keep these in one module (labels, icons, colours) so every screen uses the same words.

## 10. Accessibility (WCAG 2.2 AA)

- Full keyboard use: visible focus ring (2px `primary`, offset), logical tab order, no traps outside dialogs.
- Dialogs and drawers: focus moves in, is trapped, Esc closes, focus returns to the trigger.
- Every input has a visible label; errors are linked with `aria-describedby` and announced.
- Status is never colour alone. Charts have a text summary or a table alternative.
- Target size at least 24×24px (aim for 40px on touch).
- Toasts and async results announced through `aria-live`.
- Tables use real `<table>` markup with headers; sortable headers set `aria-sort`.
- Respect reduced motion and the user's text zoom up to 200% without loss.

## 11. Responsive rules

- Mobile first. Test at 375, 768, 1024 and 1440 wide.
- Tables become stacked cards below `md`; bulk actions move to a bottom bar.
- Primary page action stays reachable: top right on desktop, sticky bottom button on mobile.
- Drawers become full-screen sheets on mobile. Calendar defaults to agenda view on mobile.
- No horizontal page scroll; wide tables scroll inside their own container.

## 12. Definition of done (every page)

- Reachable from navigation for every role that may use it, and hidden for others.
- Loading, empty, error and success states exist.
- Every action shows pending, success and failure feedback, and database messages appear as written.
- Works with keyboard only; passes an automated axe check with no serious issues.
- Correct at 375px and 1440px, in light and dark.
- Uses only design-system components and tokens.
