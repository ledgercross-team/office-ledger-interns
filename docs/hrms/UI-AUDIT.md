# HRMS UI audit

Audited on 14 October 2026 against `UI-SPEC.md`, `plan-v3.md`, `RUNBOOK.md`, every controller registered by `backend/src/app.module.ts`, the frontend App Router tree, frontend call sites, and the package manifests. This is an inventory, not an implementation plan. No code or dependencies were changed.

## Status key

- **Exists**: there is a reachable, functional frontend consumer for the route or the core page/workflow exists.
- **Partial**: a consumer/page exists, but part of the UI-SPEC workflow, states, role treatment, accessibility, or presentation is absent.
- **Missing**: there is no frontend consumer/page.

Route status describes route coverage, not whether the whole surrounding page satisfies the UI specification. The page inventory later in this document is the stricter spec-compliance view.

## 1. Paths the application uses now

| Concern | Actual value | Evidence and consequence |
|---|---|---|
| Frontend base path (`APP_BASE`) | **`/`** | `frontend/next.config.ts` rewrites `/` and each public root such as `/people`, `/tasks`, and `/platform` to the implementation under `frontend/src/app/hrms`. `frontend/src/proxy.ts` redirects old `/hrms/*` bookmarks to their root equivalents. UI-SPEC and RUNBOOK references to `/hrms` are therefore stale for the current public URL. |
| HRMS API prefix (`API`) | **`/api`** | `HrmsController()` prefixes HRMS controllers with `api/`; `frontend/src/lib/hrms/api-client.ts` uses `NEXT_PUBLIC_HRMS_API_URL`, or derives `/api` by replacing a trailing `/api/v1` in `NEXT_PUBLIC_API_URL`. |
| Legacy API prefix | **`/api/v1`** | `backend/src/main.ts` sets `api/v1` globally; `HrmsModule` excludes non-`/api/v1` `/api/*` paths from that global prefix. |
| Feature switches | HRMS backend and frontend remain flag-gated | The backend registers `HrmsModule` only when `HRMS_V2_ENABLED=true`; `frontend/src/app/hrms/layout.tsx` returns 404 unless `NEXT_PUBLIC_HRMS_ENABLED=true`. |

One cutover inconsistency remains: source folders and several doc comments still say `/hrms`, even though root rewrites and proxy behavior make `/` the real public base.

## 2. Backend route coverage

### HRMS routes (`/api`)

These are all 103 routes declared by the currently registered HRMS controllers. They exist only when `HRMS_V2_ENABLED=true`.

#### Health and authentication

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/health` | None | Missing | Operational probe; no UI is normally required. |
| `POST /api/auth/login` | `/login` — `frontend/src/app/hrms/login/page.tsx` | Partial | Login works, but forgot/reset password, show/hide password, complete rate-limit copy, and the specified post-login picker treatment are absent. |
| `POST /api/auth/mfa/enroll` | MFA state inside `login/page.tsx` | Partial | Manual secret and code exist; no QR code, auto-advance six-box input, or backup guidance. |
| `POST /api/auth/mfa/verify` | MFA state inside `login/page.tsx` | Partial | Verification works but is not a complete spec screen. |
| `POST /api/auth/refresh` | `frontend/src/lib/hrms/api-client.ts` | Exists | Used by the single-flight refresh flow, not a visible screen. |
| `POST /api/auth/switch-org` | `auth-context.tsx`, `components/hrms/org-switcher.tsx`, home picker | Exists | Both shell switcher and initial selection call it. |
| `POST /api/auth/accept-invite` | `/accept-invite` — `accept-invite/page.tsx` | Partial | Password setup works; strength/rules and the full expired/used-link guidance are incomplete. |
| `POST /api/auth/logout` | `components/hrms/shell.tsx` via `auth-context.tsx` | Exists | Header logout calls it. |
| `POST /api/auth/change-password` | `/change-password` — `change-password/page.tsx` | Partial | Functional form; not the complete Security/account experience from the spec. |
| `GET /api/auth/me` | `frontend/src/lib/hrms/auth-context.tsx` | Exists | Supplies session, memberships, active org, and role to the whole HRMS UI. |

#### Organisation settings and export

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/org` | `/`, `/people`, `/settings` | Exists | Supplies org settings and seat usage. |
| `PATCH /api/org/settings` | `/settings` — `SettingsForm` | Partial | Working time, thresholds, and weights exist; the complete General/Subscription/Approvals structure does not. |
| `GET /api/org/office-networks` | `/settings` — `OfficeNetworks` | Exists | List is rendered. |
| `POST /api/org/office-networks` | `/settings` — `OfficeNetworks` | Partial | Add works; “Add my current IP” and design-system validation are absent. |
| `DELETE /api/org/office-networks/:id` | `/settings` — `OfficeNetworks` | Partial | Delete works without the specified confirmation treatment. |
| `GET /api/org/holidays` | `/settings` — `Holidays` | Exists | List is rendered. |
| `POST /api/org/holidays` | `/settings` — `Holidays` | Exists | Add form calls the route. |
| `DELETE /api/org/holidays/:date` | `/settings` — `Holidays` | Partial | Delete works without a shared confirmation component. |
| `GET /api/org/leave-types` | `/settings` — `LeaveTypes` | Exists | List and allowances are rendered. |
| `POST /api/org/leave-types` | `/settings` — `LeaveTypes` | Exists | Add form calls the route. |
| `PATCH /api/org/leave-types/:id` | `/settings` — `LeaveTypes` | Exists | Allowance editing calls the route. |
| `POST /api/org/export` | `/settings` — `ExportCard` | Partial | Export is reachable, but subscription/suspension context and polished download feedback are incomplete. |

#### Members

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/members` | `/people`, `/projects/new`, project detail pickers, `/calendar`, `/requests`, `/settings` | Exists | Shared list endpoint is widely used. |
| `GET /api/members/downgrade-candidates` | None | Missing | No downgrade-candidate page or panel. |
| `GET /api/members/:id` | `/people/[memberId]` | Exists | Person detail loads the member. |
| `POST /api/members` | `/people/new` | Partial | CEO/COO add form exists; seat bar and existing-account explanation are incomplete. |
| `POST /api/members/suspend` | None | Missing | No multi-select downgrade/suspension UI. |
| `PATCH /api/members/:id` | `/people/[memberId]` | Partial | Profile, role, approval, and visibility controls exist, but the tabbed detail design and confirmations do not. |
| `POST /api/members/:id/deactivate` | `/people/[memberId]` | Partial | Action exists with an inline confirmation, not the shared named-object confirm workflow. |

#### Projects and invites

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/projects` | `/projects`, `/tasks`, `/tasks/new`, `/requests` | Exists | Lists and pickers use it. |
| `POST /api/projects` | `/projects/new` | Exists | CEO create flow is functional. |
| `GET /api/projects/:id` | `/projects/[projectId]`, task create/detail | Exists | Detail and project-member context use it. |
| `PATCH /api/projects/:id` | `/projects/[projectId]` | Partial | Core fields are editable; no tabbed Overview/Activity presentation. |
| `POST /api/projects/:id/archive` | `/projects/[projectId]` | Partial | Inline confirmation does not name/count affected open tasks as required. |
| `POST /api/projects/:id/reopen` | `components/hrms/completion-panel.tsx` | Exists | Completed projects expose Reopen to CEO/COO. |
| `POST /api/projects/:id/members` | `/projects/[projectId]` — `PeoplePicker` | Exists | Direct manager addition is wired. |
| `DELETE /api/projects/:id/members/:memberId` | `/projects/[projectId]` | Partial | Removal is wired but has no confirmation dialog. |
| `PATCH /api/projects/:id/members/:memberId/lead` | `/projects/[projectId]` | Exists | Lead toggle is wired. |
| `POST /api/projects/:id/invites` | Project detail and `/requests` follow-up action | Exists | Direct and approved-request send-invite flows call it. |
| `POST /api/projects/:id/tick` | `components/hrms/completion-panel.tsx` | Partial | Works, but disabled reasons/optimistic rollback are absent. |
| `POST /api/projects/:id/complete` | `completion-panel.tsx` | Exists | Lead/no-lead completion action is wired. |
| `POST /api/projects/:id/send-back` | `completion-panel.tsx` | Partial | Route is called without the reason required by UI-SPEC. |
| `GET /api/me/invites` | `/invites` | Exists | Supplies invitations and reviews. |
| `POST /api/invites/:id/accept` | `/invites` — `InviteCard` | Exists | Accept is wired. |
| `POST /api/invites/:id/decline` | `/invites` — `InviteCard` | Partial | Required reason exists inline, not in shared ReasonDialog. |
| `POST /api/invites/:id/review` | `/invites` — `ReviewCard` | Partial | Accept/overrule works; overrule reason is inline rather than a shared dialog. |

#### Tasks

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/tasks` | `/tasks`, `/requests` | Exists | List and request form use it. |
| `POST /api/projects/:projectId/tasks` | `/tasks/new` | Exists | Create form is wired, including request id support. |
| `GET /api/tasks/:id` | `/tasks/[taskId]` | Exists | Detail loads the task. |
| `PATCH /api/tasks/:id` | None | Missing | No UI to edit title, description, urgency, or due date after creation. |
| `POST /api/tasks/:id/status` | `/tasks/[taskId]` | Partial | Allowed action controls and reasons/comments exist, but the page is not a drawer and actions use local controls. |
| `POST /api/tasks/:id/assignees` | Task detail and `/requests` follow-up action | Exists | Add/assign is wired. |
| `DELETE /api/tasks/:id/assignees/:memberId` | `/tasks/[taskId]` | Partial | Removal works without confirmation/undo feedback. |
| `GET /api/tasks/:id/history` | `/tasks/[taskId]` | Exists | Timeline data is rendered. |

#### Requests

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/requests` | `/requests` | Exists | Mine/to-decide tabs and filters use it. |
| `POST /api/requests` | `/requests` — `NewRequestForm` | Exists | Typed request creation is wired. |
| `POST /api/requests/bulk` | `/requests` | Partial | Bulk approve/reject works; shared bottom bulk bar and URL-state behavior are absent. |
| `GET /api/requests/:id` | None | Missing | No request-detail page/drawer; cards rely on list payloads. |
| `POST /api/requests/:id/approve` | `/requests` and `/leave` | Exists | Individual approval is wired. |
| `POST /api/requests/:id/reject` | `/requests` and `/leave` | Partial | Reason is required but collected inline, not through ReasonDialog. |
| `POST /api/requests/:id/cancel` | `/requests` | Exists | Mine/pending cancellation is wired. |

#### Attendance and leave

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `POST /api/attendance/check-in` | `/attendance` | Partial | One-tap action exists; specified CheckInCard and disabled reason treatment are not reused. |
| `POST /api/attendance/check-out` | `/attendance` | Partial | One-tap action exists; quick action is missing from the top bar. |
| `GET /api/attendance/me` | `/attendance` | Exists | Month and today data are shown. |
| `GET /api/attendance` | `/attendance/team` | Partial | Day and selected-person/month views exist; person discovery/picker is incomplete. |
| `POST /api/attendance/corrections` | `components/hrms/attendance-parts.tsx` — `CorrectionDialog` | Partial | Form works but is a custom fixed overlay without accessible focus management. |
| `GET /api/attendance/report` | `/attendance/team` | Exists | CSV download is wired. |
| `GET /api/leave/balance` | `/leave` | Exists | Balance cards are present. |
| `GET /api/leave` | `/leave` | Exists | Mine, team, and to-decide scopes are all queried. |
| `POST /api/leave` | `/leave` | Partial | Form supports half days but lacks live working-day and over-allowance feedback. |
| `POST /api/leave/:requestId/cancel` | `/leave` | Partial | Before-start cancellation is wired; request-change-after-start UI is absent. |

#### Calendar, meetings, and workload

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/calendar` | `/calendar` | Partial | Month/week feed works; agenda view, legend, icons, and person filter are absent. |
| `POST /api/meetings` | `/calendar` — `NewMeeting` | Partial | Create works; native form and invitee checklist need the specified design-system behavior. |
| `GET /api/meetings/:id` | `/calendar` — `MeetingDialog` | Partial | Details open in a custom modal without focus trap/Esc/focus return. |
| `PATCH /api/meetings/:id` | None | Missing | No meeting edit UI. |
| `POST /api/meetings/:id/cancel` | `MeetingDialog` | Partial | Cancel exists without ConfirmDialog. |
| `POST /api/meetings/:id/respond` | `MeetingDialog` | Exists | Invitee accept/decline is wired. |
| `GET /api/workload` | `/workload`, `/tasks/new` | Exists | Page and assignment picker use it. |

#### Ratings, performance, notifications, and audit

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/me/ratings-due` | `/ratings`, `/projects` banner | Exists | Due projects are surfaced. |
| `POST /api/projects/:id/ratings` | `/ratings` | Partial | Batch stars/comments work; anonymity/window guidance is incomplete. |
| `GET /api/performance` | `/performance`, `/people` | Exists | Dashboard rows and people scores use it. |
| `GET /api/performance/:memberId` | `components/hrms/performance-parts.tsx` — `BreakdownDrawer` | Partial | Breakdown is rendered in a custom modal-like overlay rather than the specified drawer. |
| `GET /api/notifications` | notification bell and `/notifications` | Exists | Bell count and full list use it. |
| `GET /api/notifications/email-prefs` | `/notifications` — `EmailPreferences` | Exists | Preferences are loaded. |
| `PUT /api/notifications/email-prefs` | `/notifications` — `EmailPreferences` | Partial | Toggle saves; optimistic behavior and required-category explanation are incomplete. |
| `POST /api/notifications/read-all` | `/notifications` | Partial | Action works but is not optimistic. |
| `POST /api/notifications/:id/read` | `/notifications` | Partial | Action works but is not optimistic. |
| `GET /api/audit` | `/history` | Partial | Basic table/date filters exist; who/object/from-where and URL-state coverage are incomplete. |
| `POST /api/audit/:id/notes` | `/history` — entry expansion | Partial | CEO notes work; detail is inline rather than a drawer. |

#### Platform and recovery

| Method and route | Screen / component consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/platform/orgs` | `/platform` — `Orgs` | Exists | Count-only org list is rendered. |
| `GET /api/platform/plans` | `/platform` — `Orgs` | Exists | Plan selectors use it. |
| `POST /api/platform/orgs` | `/platform` — new-org form | Exists | Create-org form is wired. |
| `POST /api/platform/orgs/:id/block` | `/platform` — `OrgRow` | Partial | Reason is required inline; no ReasonDialog/ConfirmDialog. |
| `POST /api/platform/orgs/:id/unblock` | `/platform` — `OrgRow` | Exists | Action is wired. |
| `POST /api/platform/orgs/:id/plan` | `/platform` — `OrgRow` | Partial | Plan change is wired; downgrade confirmation is absent. |
| `GET /api/platform/requests` | `/platform` — `Requests` | Exists | Recovery/removal requests are listed. |
| `POST /api/platform/requests/:id/verify` | `/platform` — `Requests` | Partial | The required explicit verification checkbox and notes are absent. |
| `POST /api/platform/requests/:id/complete` | `/platform` — `Requests` | Partial | Action exists without hard-action confirmation. |
| `GET /api/platform/game-masters` | `/platform` — `GameMasters` | Exists | List is rendered. |
| `POST /api/platform/game-masters` | `/platform` — `GameMasters` | Exists | Pending creation is wired. |
| `POST /api/platform/game-masters/:userId/confirm` | `/platform` — `GameMasters` | Exists | UI correctly withholds self/creator confirmation. |
| `POST /api/org/recovery-requests` | `/settings` — `RecoveryCard` | Partial | COO request form exists; broader Recovery section and downstream link screen are incomplete. |
| `POST /api/org/last-ceo-removal` | `/settings` — `RecoveryCard` | Partial | CEO request form exists; confirmation treatment is incomplete. |

### Legacy routes (`/api/v1`)

The legacy controllers are still registered, so they are part of the backend surface even after the frontend root cutover. These 13 routes are outside the HRMS UI specification but are included to make the controller audit exhaustive.

| Method and route | Existing frontend consumer | Status | Audit note |
|---|---|---|---|
| `GET /api/v1/health` | None | Missing | Operational probe; no UI expected. |
| `POST /api/v1/auth/login` | None | Missing | The public `/login` now rewrites to HRMS login. |
| `POST /api/v1/auth/refresh` | `frontend/src/lib/api-client.ts` | Exists | Legacy single-flight refresh can still call it. |
| `POST /api/v1/auth/logout` | legacy `auth-context.tsx` / `(app)/layout.tsx` | Partial | Retained shell action, but there is no current legacy login entry point. |
| `POST /api/v1/auth/change-password` | None reachable | Missing | Root `/change-password` now rewrites to HRMS. |
| `GET /api/v1/auth/me` | root `AuthProvider` | Partial | It is still queried globally, including around HRMS pages, but does not power HRMS auth. |
| `GET /api/v1/dashboard/summary` | `frontend/src/app/(app)/dashboard/page.tsx` | Partial | Legacy screen remains by direct `/dashboard`; it is not part of HRMS navigation. |
| `GET /api/v1/employee-services/complaints` | `(app)/complaints/page.tsx` | Exists | Deliberately retained only in v1. |
| `POST /api/v1/employee-services/complaints` | `(app)/complaints/page.tsx` | Exists | Deliberately retained only in v1. |
| `GET /api/v1/message-threads/unread` | legacy `(app)/layout.tsx` | Exists | Deliberately retained only in v1. |
| `GET /api/v1/message-threads/:companyId/messages` | `components/message-thread.tsx` | Exists | Used by legacy messages pages. |
| `POST /api/v1/message-threads/:companyId/messages` | `components/message-thread.tsx` | Exists | Used by legacy messages pages. |
| `POST /api/v1/message-threads/:companyId/mark-read` | `components/message-thread.tsx` | Exists | Used by legacy messages pages. |

## 3. UI-SPEC section 7 page inventory

All paths below are public root paths; the implementation files remain under `app/hrms` because of the rewrites.

| Spec page/workflow | Status | Current file | Principal gaps |
|---|---|---|---|
| Login | Partial | `frontend/src/app/hrms/login/page.tsx` | No forgot-password flow, show/hide control, full 429 wait treatment, or in-page organisation picker cards. |
| MFA enrolment and verification | Partial | `frontend/src/app/hrms/login/page.tsx` | No QR, six auto-advance boxes, or backup guidance. |
| Accept invite | Partial | `frontend/src/app/hrms/accept-invite/page.tsx` | No strength meter/rules; expired/used guidance is generic. |
| Reset password | Missing | — | No backend route or page. |
| CEO recovery link completion | Missing | — | Requests can be filed/verified, but no frontend route consumes the recovery link. |
| Blocked / suspended / 403 / 404 / 500 full-page states | Missing | — | Only inline errors and framework 404 behavior exist. |
| CEO/COO dashboard | Missing | `frontend/src/app/hrms/(app)/page.tsx` | Root is an account/org summary, not the required role dashboard. |
| Manager dashboard | Missing | `frontend/src/app/hrms/(app)/page.tsx` | Required projects, review, workload, attendance, and meetings panels are absent. |
| Employee dashboard | Missing | `frontend/src/app/hrms/(app)/page.tsx` | Check-in, tasks, invites, ratings, calendar, and leave panels are absent. |
| People list | Partial | `frontend/src/app/hrms/(app)/people/page.tsx` | Basic filters/table and scores exist; project/workload filters, bulk actions, responsive DataTable states, and full columns do not. |
| Add person | Partial | `frontend/src/app/hrms/(app)/people/new/page.tsx` | Missing seat bar, at-limit disabled explanation, and manager request variant on this screen. |
| Person detail | Partial | `frontend/src/app/hrms/(app)/people/[memberId]/page.tsx` | Profile controls exist; required header, tabs, related-resource views, and shared confirmations do not. |
| Downgrade candidates | Missing | — | Both endpoint consumers and page are absent. |
| Projects list | Partial | `frontend/src/app/hrms/(app)/projects/page.tsx` | Card list exists; table toggle, all filters, archived ordering treatment, and full states are absent. |
| New project | Partial | `frontend/src/app/hrms/(app)/projects/new/page.tsx` | CEO create exists; COO request is only available through generic Requests, not this workflow. |
| Project detail | Partial | `frontend/src/app/hrms/(app)/projects/[projectId]/page.tsx` | Overview/people/completion/edit exist; tabs, embedded task list, activity/status history, and pending invite display are absent. |
| Invite employee | Partial | `frontend/src/app/hrms/(app)/projects/[projectId]/page.tsx` | Send works; workload/on-leave context and “Ready to invite” approved-request treatment are incomplete. |
| Project completion panel | Partial | `frontend/src/components/hrms/completion-panel.tsx` | Core flow exists; send-back reason, disabled reasons, success feedback, and specified banner/lock presentation are incomplete. |
| Archive project | Partial | `frontend/src/app/hrms/(app)/projects/[projectId]/page.tsx` | Confirmation does not state project name and open-task count. |
| Invites: to me / to review | Partial | `frontend/src/app/hrms/(app)/invites/page.tsx` | Core actions work; shared reason dialogs, tabs/counts, and complete feedback states are absent. |
| Tasks list | Partial | `frontend/src/app/hrms/(app)/tasks/page.tsx` | Filtered list exists; board, drag rules, grouping/sorting UI, avatars, and responsive view treatment are absent. |
| Create task | Partial | `frontend/src/app/hrms/(app)/tasks/new/page.tsx` | Core form and workload load exist; richer pickers, on-leave warning, and request-button wording/prefill treatment are incomplete. |
| Task detail drawer | Partial | `frontend/src/app/hrms/(app)/tasks/[taskId]/page.tsx` | It is a page, not a drawer; status/assignees/history work, but task field editing and outside-project combined request are missing. |
| Requests inbox | Partial | `frontend/src/app/hrms/(app)/requests/page.tsx` | Tabs, filters, decisions, bulk, and follow-ups exist; expiry/context depth, URL state, shared dialogs, and toast behavior are incomplete. |
| Attendance: Me | Partial | `frontend/src/app/hrms/(app)/attendance/page.tsx` | Check in/out, totals, month table, correction exist; calendar visual, legend, network disabled reason, and reused CheckInCard are absent. |
| Attendance: Team | Partial | `frontend/src/app/hrms/(app)/attendance/team/page.tsx` | Day/person query and CSV exist; complete person picker/table/month workflow is absent. |
| Leave | Partial | `frontend/src/app/hrms/(app)/leave/page.tsx` | Balances, request, histories, and decisions exist; live day count, overlap/allowance detail, and change-after-start flow are absent. |
| Calendar and meetings | Partial | `frontend/src/app/hrms/(app)/calendar/page.tsx` | Month/week, create, detail/respond/cancel exist; agenda, person filter, legend/icons, meeting edit, and accessible dialogs are absent. |
| Workload | Partial | `frontend/src/app/hrms/(app)/workload/page.tsx` | Basic grid exists; sort, threshold legend, richer project/on-leave context, and role-specific view details are incomplete. |
| Ratings due | Partial | `frontend/src/app/hrms/(app)/ratings/page.tsx` | Batch stars/comments exist; days-left and anonymity/three-rating explanation are incomplete. |
| Performance | Partial | `frontend/src/app/hrms/(app)/performance/page.tsx` | Scores and breakdown exist; full table fields, trends/labels, responsive DataTable, and accessible drawer are incomplete. |
| Notifications full page | Partial | `frontend/src/app/hrms/(app)/notifications/page.tsx` | List/read actions exist; day grouping and optimistic behavior are absent. |
| Email preferences | Partial | `frontend/src/app/hrms/(app)/notifications/page.tsx` | Toggles exist; mandatory request preference needs the specified disabled reason treatment. |
| History (audit) | Partial | `frontend/src/app/hrms/(app)/history/page.tsx` | List, basic filters, expansion, and CEO note exist; complete columns/filtering and detail drawer are absent. |
| Settings | Partial | `frontend/src/app/hrms/(app)/settings/page.tsx` | Working time, thresholds, weights, networks, holidays, leave types, recovery, export exist; sub-nav, General name/timezone, Approvals, Subscription, and “Add my IP” are absent. |
| Platform: Organisations | Partial | `frontend/src/app/hrms/(app)/platform/page.tsx` | Core list/create/block/plan works; proper table, dialogs, and detailed feedback states are absent. |
| Platform: Platform requests | Partial | `frontend/src/app/hrms/(app)/platform/page.tsx` | Verify/complete exist; offline checkbox and notes are absent. |
| Platform: GameMasters | Partial | `frontend/src/app/hrms/(app)/platform/page.tsx` | List/create/confirm exist; it shares one long page rather than the separate platform navigation/shell. |
| Platform: Security | Missing | — | No separate Security screen in the gameMaster shell. |

The app shell itself is also partial: `components/hrms/shell.tsx` is a wrapping top navigation, not the specified desktop sidebar/mobile drawer/bottom tabs; it lacks breadcrumbs, command palette, quick check-in, user menu, global org banners, read-only disabled-control treatment, and a separate platform shell.

## 4. Existing component audit

There is no shared `frontend/src/components/ui/` design system today. Pages repeat Tailwind class strings for inputs, cards, primary/secondary buttons, fixed overlays, loading copy, and inline alerts.

| Existing component(s) | Match to UI-SPEC | Recommendation |
|---|---|---|
| `components/hrms/progress-bar.tsx` | Good domain match for ProgressBar | Keep behavior, move onto a shared ProgressBar primitive and semantic tokens. |
| `components/hrms/seat-bar.tsx` | Good specialisation of ProgressBar/Banner | Keep as a composed component; add the exact 80/95/100 warning treatment. |
| `components/hrms/workload-chip.tsx` | Direct match for WorkloadChip | Keep and restyle on shared Badge/StatusPill primitives. |
| `components/hrms/task-badges.tsx`, `project-status.tsx`, `attendance-parts.tsx::StatusPill`, legacy `status-badge.tsx`, `attendance-status.tsx` | Partial match, but status rendering is fragmented | Merge into one status vocabulary module plus one `Badge/StatusPill`; retain thin domain wrappers only where useful. |
| `components/hrms/completion-panel.tsx` | Matches the project completion domain component | Keep logic; replace local buttons/errors with shared primitives and add send-back ReasonDialog. |
| `components/hrms/notification-bell.tsx` | Matches the shell bell at a minimal level | Keep query logic; replace link-only result with the specified latest-10 dropdown/menu. |
| `components/hrms/org-switcher.tsx` | Matches organisation switching | Keep logic; merge its presentation into the shared user menu/dropdown. |
| `components/hrms/performance-parts.tsx` | ScoreBadge matches; BreakdownDrawer only resembles a drawer | Keep data logic; move ScoreBadge onto shared status primitives and replace overlay with shared Drawer. |
| `components/hrms/attendance-parts.tsx::MonthTable` | Partial attendance calendar/table match | Merge with legacy `attendance-chart.tsx` and `attendance-status.tsx` into one HRMS attendance presentation. |
| `components/hrms/attendance-parts.tsx::CorrectionDialog` | Domain match but not accessible dialog behavior | Keep form logic; replace overlay with shared Dialog/Reason-style form. There is no standalone `correction-dialog.tsx` despite the spec naming one. |
| Legacy `stat-tile.tsx` | Direct match for StatTile | Reuse/merge into `ui/StatTile`; HRMS dashboard currently does not use it. |
| Legacy `pagination.tsx` | Direct match for Pagination | Reuse/merge into `ui/Pagination`; HRMS pages currently hand-roll pagination. |
| Legacy `timezone-select.tsx` | Direct match for TimezoneSelect | Reuse/merge into the new field system and add it to profile/settings. |
| Legacy `date-input.tsx`, `date-time-picker.tsx` | Partial match for DatePicker/TimeInput | Reuse validation ideas; replace native/local presentation with the approved accessible date primitives. |
| Legacy `task-card.tsx` and HRMS task list rows | Both represent task summaries, with different models/styles | Replace with one HRMS-aware TaskCard used by list, board, dashboard, and project detail. |
| Legacy `task-action-bar.tsx` and task-detail action block | Same responsibility, incompatible status models | Replace both with one HRMS TaskActionBar driven by allowed actions. |
| Legacy `check-in-card.tsx` and `/attendance` inline check-in section | Duplicate responsibility | Merge into one HRMS CheckInCard and reuse it in dashboard, Attendance, and shell quick check-in. |
| Legacy `open-task-list.tsx`, `overdue-list.tsx` | Match dashboard panels conceptually but use v1 APIs/types | Replace their data layer with HRMS queries, then reuse as composed dashboard lists. |
| Legacy `attendance-chart.tsx`, `attendance-insights.tsx`, `story.tsx` | Some chart/summary ideas match Attendance and Performance | Reuse accessible summary ideas selectively; remove v1-only narrative/visual duplication after cutover. |
| `components/hrms/role-gate.tsx` and legacy `role-gate.tsx` | Duplicate role gates for different role types | Keep a single HRMS gate after v1 removal; server/API remains authoritative. |
| `components/hrms/shell.tsx` | Partial App shell | Replace layout with shared Sidebar, TopBar, mobile Drawer, bottom tabs, banners, and user menu; preserve auth/nav logic. |
| `category-tag.tsx` | Explicitly out of plan v3 | Retire with v1 task categories. |
| `message-thread.tsx`, `temporary-password-panel.tsx` | v1-only and intentionally outside HRMS | Do not bring into the HRMS design system. |
| `hold-button.tsx`, `reveal.tsx`, `scrolly.tsx`, `nav-icons.tsx` | Generic/legacy utilities, not the specified primitives | Evaluate per use; replace icon map with the approved icon set and avoid carrying decorative motion into core HRMS UI. |

Missing shared components are every item in UI-SPEC §4 except the domain-level approximations above: Button; complete field family; DatePicker/DateRangePicker/TimeInput; Avatar/AvatarStack; Card/StatTile; DataTable; Tabs/SegmentedControl/Breadcrumbs; Dialog/ConfirmDialog/ReasonDialog/Drawer; DropdownMenu/Popover/Tooltip; Toast; EmptyState/ErrorState/Skeleton/Banner/PageHeader/FilterBar; and CommandPalette.

## 5. Frontend packages

### Installed directly in `frontend/package.json`

| Area | Installed | Assessment |
|---|---|---|
| Framework | `next`, `react`, `react-dom` | Correct existing App Router/React stack. |
| Server state | `@tanstack/react-query` | Correct and already used throughout HRMS. |
| Styling | `tailwindcss`, `@tailwindcss/turbopack` | Correct existing Tailwind 4 stack. |
| Motion | `motion` | Available for restrained transitions and reduced-motion handling; not yet a component system. |
| UI primitives | None | Dialogs, menus, popovers, tooltips, switches, and focus management are currently custom or absent. |
| Icons | None | Current navigation/status marks are text or locally authored SVG; there is no consistent icon system. |
| Forms/schema validation | None | Forms use `FormData`, local state, and native validation, producing repeated error/pending logic. |
| Frontend component testing | None | The repo has backend Jest, but the frontend package has no test runner, DOM environment, or Testing Library. |
| Playwright | None | There is no browser/e2e runner or script. |
| axe | None | There is no automated accessibility scanner. |

### Proposed package approval set for UI-1

No package has been installed. This is the set to approve, reject, or amend before UI-1.

#### Runtime dependencies

| Package | Reason |
|---|---|
| `radix-ui` | One headless primitive suite for accessible dialogs, alert dialogs, menus, popovers, tooltips, tabs, form controls, and focus management without adding a styling system. |
| `lucide-react` | One consistent, tree-shakeable icon set for navigation, statuses, actions, and empty states. |
| `react-hook-form` | Centralises field state, blur/submit validation, pending behavior, and preservation of user input after API errors. |
| `zod` | Reusable typed client-side schemas and clear field errors; it complements, but never replaces, server validation. |
| `@hookform/resolvers` | Connects Zod schemas to React Hook Form without bespoke adapters in every form. |
| `react-day-picker` | Supplies a keyboard-usable calendar surface for date and range pickers, including the leave range workflow. |
| `date-fns` | Date arithmetic/formatting for calendar grids, ranges, relative labels, and DayPicker integration; timezone display still uses the API/user zone and `Intl`. |

#### Development dependencies

| Package | Reason |
|---|---|
| `vitest` | Fast frontend unit/component test runner with TypeScript/ESM support. |
| `jsdom` | Browser-like DOM environment for component tests. |
| `@testing-library/react` | Tests components through user-visible behavior rather than implementation details. |
| `@testing-library/user-event` | Exercises realistic keyboard, pointer, and form interaction. |
| `@testing-library/jest-dom` | Adds readable DOM and accessibility-oriented assertions usable with Vitest. |
| `@playwright/test` | Required browser-level tests at the specified breakpoints and for role workflows. |
| `@axe-core/playwright` | Runs automated axe checks inside Playwright and enforces the no-serious-issues gate. |

This deliberately avoids a second CSS system, global state library, separate toast package, and separate modal/menu packages. Toast presentation can be built on the approved primitive suite; TanStack Query remains the server-state layer.

## 6. Backend routes with no UI at all

### HRMS

| Route | Needed UI |
|---|---|
| `GET /api/health` | None; operational probe only. |
| `GET /api/members/downgrade-candidates` | Downgrade candidates screen/panel in People or Subscription. |
| `POST /api/members/suspend` | Multi-select bulk suspend action with seats-freed summary. |
| `PATCH /api/tasks/:id` | Task field editing for title, description, urgency, and due date. |
| `GET /api/requests/:id` | Request detail drawer/page, or intentionally remove the unused endpoint later. |
| `PATCH /api/meetings/:id` | Meeting edit form for the creator. |

### Legacy, still exposed but without a currently reachable UI action

- `GET /api/v1/health` is an operational probe.
- `POST /api/v1/auth/login` has no current frontend login because `/login` is the HRMS rewrite.
- `POST /api/v1/auth/change-password` has no current page because `/change-password` is the HRMS rewrite.

## Bottom line

The backend surface is nearly all connected: 97 of 103 HRMS routes have some frontend consumer, and 6 do not. That call-site coverage overstates UI readiness. Every substantive section 7 area is partial except the three role dashboards, downgrade flow, recovery/reset/error pages, and platform Security page, which are missing. The current pages are functional phase-delivery screens, not yet the shared, responsive, accessible SaaS UI described by UI-SPEC.
