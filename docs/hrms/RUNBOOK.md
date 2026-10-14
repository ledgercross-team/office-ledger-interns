# HRMS Migration Runbook

How to move the project from the current app to the HRMS v3 design in small, safe steps, without breaking what works today. Give this file to Claude Code together with the other files in `docs/hrms/`.

## Ground rules (the v1 contract)

1. **v1 keeps working exactly as it does today.** Same routes, same cookies, same database, same screens. Every phase ends with the v1 smoke check passing.
2. **The new system is built beside the old one.** New API under `/api`, new database `office_ledger_hrms`, new cookies `hrms_access` and `hrms_refresh`, new screens under `/hrms`.
3. **Everything new sits behind a switch.** `HRMS_V2_ENABLED=false` means no v2 route exists and the API behaves like today. `NEXT_PUBLIC_HRMS_ENABLED=false` hides the new screens.
4. **The database owns the rules.** Seat limits, who may approve what, task transitions, check-in from office IPs and the like are already enforced in `hrms_schema.sql`. The API does not copy them. It passes the database's error message to the user.
5. **One phase at a time.** Claude Code stops at each gate, reports, and waits. You decide when to continue.
6. **Nothing is deleted from v1 until cutover is done.** Cleanup is the last step, not a side effect.

**The only edits allowed in existing v1 files:**

- The three global guards (`JwtAuthGuard`, `AccountStateGuard`, `RolesGuard`) return early for paths that start with `/api`. Each edit is one line plus a test proving a v1 request behaves the same.
- `app.module.ts` imports `HrmsModule` only when `HRMS_V2_ENABLED=true`.
- `config/env.validation.ts` and `.env.example` gain the new variable names (placeholders only).
- `proxy.ts` in the frontend learns that `/hrms/*` pages check for the `hrms_access` cookie.

## Choices already made

| Question | Default | Why |
|---|---|---|
| Keep Drizzle or switch? | Keep Drizzle as the query builder. Pull the new schema with `drizzle-kit pull` into `backend/src/hrms/db/schema/`. Changes to the new database are numbered SQL files. Never run `drizzle-kit generate` for it. | The SQL file has triggers and row-level security that Drizzle cannot express. The old `drizzle/` folder stays untouched. |
| Complaints and admin to gameMaster messages | Stay in v1 only. Not ported. | Neither is in plan v3. The messages thread also conflicts with "the gameMaster never sees org data". Decide at cleanup. |
| Task comments | Not ported. Status changes keep their comment in the status history. | Not in plan v3. |
| Task categories | Not ported. | Not in plan v3. Old tasks keep theirs in the old database. |
| Session storage | The `refresh_tokens` table from `0002_auth_sessions.sql`. Redis stays for rate limiting only. | Same rotation and reuse detection as today. |
| Scheduler and email | `@nestjs/schedule` inside the API with a Postgres advisory lock so two copies never double-run. `nodemailer` over SMTP, with `MAIL_TRANSPORT=log` in development. | Nothing exists today. This is the smallest option and any provider can replace it later. This one is your call. |
| Existing data | Start fresh with a seed script. An import script is optional (last section). | Your audit says the data is probably demo data. |

## What Claude Code must know about the database

1. **Connect as `hrms_api`, never as the owner.** The owner skips row-level security, which switches off the separation between orgs.
2. **One request is one transaction, and it starts with four settings.** `set_config('app.org_id' | 'app.member_id' | 'app.user_id' | 'app.client_ip', value, true)`. An empty string means not set. Use the `true` flag so the setting ends with the transaction.
3. **Before an org is chosen, use `my_memberships(user_id)`.** Login and the org switcher run with no org set, and row-level security hides every membership then. Set `app.user_id` to the verified user, then call the function.
4. **The gameMaster console uses only the `gm_*` functions.** `gm_list_orgs`, `gm_create_org`, `gm_set_org_blocked`, `gm_set_org_plan`, `gm_list_platform_requests`, `gm_verify_platform_request`, `gm_complete_remove_last_ceo`. Call each in its own transaction with `app.org_id` empty. They switch the org themselves. A gameMaster cannot read org tables directly.
5. **Rule errors carry readable messages.** A broken rule raises SQLSTATE `P0001` with a sentence written for people. Show it. Other codes: `23514` check, `23505` duplicate, `23503` missing reference, `42501` not allowed.
6. **Some checks run at COMMIT, not at the statement.** Seat limit, "an org keeps a CEO" and "a meeting has an invitee". Map errors thrown at commit the same way. Create a meeting and its invitees in the same transaction.
7. **Approving a request does not perform it.** After approval, someone performs the action in one transaction and marks the request applied. Who: `create_user` and `create_project` by the approver, `add_to_project` by the requesting manager sending the invite, `create_task` and `assign_task` by the requesting manager passing the request id. The database checks the approval exists.
8. **Inside an org, row-level security only separates orgs.** Who may read whose attendance, tasks, calendar and workload is the API's job. The database enforces two reads itself: performance scores (CEO and COO only) and raw ratings (nobody; use `v_rating_summary`).
9. **`users` is shared by all orgs and has no row-level security.** List columns explicitly. Never return `password_hash` or `mfa_secret_enc`.
10. **Scheduled jobs run per org.** `list_active_org_ids()` gives the orgs. For each, set `app.org_id` and leave `app.member_id` empty (system context), then call `job_expire_pending()`, `job_auto_checkout(org, day)` or `job_compute_performance(org, date)`.
11. **Nothing is deleted.** No delete routes for members, projects, tasks, requests, attendance or ratings. Use status changes. The database refuses deletes anyway.
12. **Requests cannot be edited after they are made.** Cancel and file a new one.
13. **Times are `timestamptz`.** The org's time zone is in `org_settings.timezone`; each person's display zone is `users.timezone`. Use `add_working_days()` for deadlines that skip weekends and holidays.

Error mapping:

| SQLSTATE | HTTP | Meaning |
|---|---|---|
| `P0001` | 409 | Rule message, shown as is |
| `23514` | 422 | Check failed |
| `23505` | 409 | Already exists |
| `23503` | 409 | Points at something that does not exist |
| `42501` | 403 | Not allowed (includes row-level security) |
| `anything else` | 500 | Log it, show a generic message |

## Phases

### Phase 0: Safety net

**Goal.** Be able to prove, after every phase, that the current app still works.

**Backend.**

- Create branch `hrms-v2` from your current branch and tag the starting commit `pre-hrms`.
- Copy the seven files from the Start section into `docs/hrms/`.
- Dump the current database to a file outside the repo (`pg_dump`).
- Write `scripts/v1-smoke.sh`: log in as the seeded demo admin, manager and employee and call `/auth/me`, `/dashboard/summary`, `/tasks`, `/users`, `/attendance/me` and `/company/subscription`. Print status codes and the field names of each response. Run it now and save the output as `scripts/v1-smoke.baseline.txt`.
- Record the baseline: `pnpm lint`, `typecheck`, `test`, `build` all pass.
- Add `HRMS_V2_ENABLED=false` and `NEXT_PUBLIC_HRMS_ENABLED=false` to env validation and `.env.example`.
- Replace the real-looking secrets in the committed `.env.example` with placeholders, and rotate any secret that was ever used for real (your audit flagged this).

**Replaces in v1.** Nothing.

**Gate (do not continue until all are true).**

- Smoke baseline saved and passing.
- Lint, typecheck, test, build green.
- `git diff` touches only docs, scripts and env files.

**Rollback.** Delete the branch.

### Phase 1: New database online

**Goal.** Create the new database and prove the rules work, before any code talks to it.

**Backend.**

- Create database `office_ledger_hrms` on the same server. It must not share tables with the current database.
- Apply `docs/hrms/hrms_schema.sql`, then `docs/hrms/0002_auth_sessions.sql`, as the database owner.
- Create the application login role (SQL below).
- Write `backend/scripts/hrms-migrate.ts`: applies numbered SQL files from `docs/hrms/` in order and records each in a `public.hrms_migration_log` table so it never runs one twice. New changes become `0003_...sql` and so on. Applied files are never edited.
- Run the rule tests on a throwaway database: create it, load the schema, then `psql -f docs/hrms/hrms_rule_tests.sql`. Run it as a superuser, or as an owner that is a member of `hrms_app`.

```sql
CREATE ROLE hrms_api LOGIN PASSWORD '<from your secret store>' IN ROLE hrms_app;
ALTER ROLE hrms_api SET search_path = hrms, public;
```

**Replaces in v1.** Nothing.

**Gate (do not continue until all are true).**

- The new database has the `hrms` schema with 32 tables and 11 views.
- Connecting as `hrms_api` and running `SELECT count(*) FROM org_members` returns 0, not an error (no org chosen, so nothing is visible).
- The rule tests report 116 passed and 0 failed on the throwaway database.

**Rollback.** Drop the database.

### Phase 2: Backend plumbing

**Goal.** Give the API a second database connection and the per-request settings the database needs.

**Backend.**

- `HrmsDbModule`: a second connection pool from `HRMS_DATABASE_URL` (the `hrms_api` login) and a second Drizzle instance. Pull the table definitions with `drizzle-kit pull` using a separate `drizzle.hrms.config.ts`, filtered to the `hrms` schema, into `backend/src/hrms/db/schema/`.
- `HrmsContext`: opens a transaction for each v2 request and sets the four `app.*` values (sketch below). An interceptor wraps every v2 controller method. The commit happens after the handler, and commit errors are mapped too.
- `HrmsErrorFilter`: maps database errors to HTTP responses (table below).
- A system context (no member id) for jobs and login lookups.
- `HrmsModule` loads only when `HRMS_V2_ENABLED=true`. Routes live under `/api`. Add `GET /api/health` that checks the new database.
- Make the three v1 guards skip `/api` paths (the only v1 edit in this phase), with a test that a v1 request is unchanged.
- Tests: inside a context for org A, `SELECT current_org_id()` returns A and org B's rows are invisible; an exception inside the transaction rolls everything back.

```ts
// backend/src/hrms/db/hrms-context.ts  (sketch of the idea, not final code)
await db.transaction(async (tx) => {
  await tx.execute(sql`select
    set_config('app.org_id',    ${ctx.orgId    ?? ''}, true),
    set_config('app.member_id', ${ctx.memberId ?? ''}, true),
    set_config('app.user_id',   ${ctx.userId   ?? ''}, true),
    set_config('app.client_ip', ${ctx.ip       ?? ''}, true)`);
  return fn(tx);   // every query of the request uses tx
});
```

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/health` | public | New database reachable |

**Replaces in v1.** Nothing.

**Gate (do not continue until all are true).**

- With the flag off, the v1 smoke output is identical to the baseline and `/api/health` returns 404.
- With the flag on, `/api/health` is OK.
- The context tests pass.

**Rollback.** Set `HRMS_V2_ENABLED=false`.

### Phase 3: Sign-in v2 and seed data

**Goal.** Log in to the new system. Users can belong to several orgs and switch between them.

**Backend.**

- Login: find the user by email in `hrms.users`, verify the argon2 hash (reuse `passwords.ts`), set `app.user_id`, call `my_memberships()`. One usable membership signs in directly. Several return the list for the org switcher.
- Cookies `hrms_access` and `hrms_refresh`. The JWT carries the user id, member id and org id and **not** the role. Every request looks the membership up again inside the context, so a role change or deactivation takes effect at once.
- Refresh tokens in `refresh_tokens` with the same rotation and reuse detection as `token.service.ts`.
- A guard that checks the membership is active and reads `orgs.status`: `blocked` refuses everyone; `suspended` lets only CEO and COO in, to renew; `read_only` allows reads only.
- GameMasters have no membership. Their token has no org id and they may only call `/api/platform/*`.
- Seed script `pnpm db:seed:hrms` (runs as the owner): a bootstrap gameMaster, one org through `gm_create_org`, a COO, two managers, three employees. Passwords from `SEED_DEMO_PASSWORD`. Safe to run twice.

**Frontend.**

- `frontend/src/lib/hrms/api-client.ts` (copy the single-flight refresh pattern from `api-client.ts`), an auth context holding memberships and the active org, an org switcher, and `/hrms/login`.
- Role names in the new code are `gameMaster`, `ceo`, `coo`, `manager`, `employee`. Do not touch the v1 role type.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| POST | `/api/auth/login` | public | Returns session or membership list |
| POST | `/api/auth/switch-org` | signed in | Body: memberId. New cookies |
| POST | `/api/auth/refresh` | cookie | Rotates the refresh token |
| POST | `/api/auth/logout` | signed in |  |
| POST | `/api/auth/change-password` | signed in |  |
| GET | `/api/auth/me` | signed in | User, memberships, active member, org status |

**Replaces in v1.** `/auth/*` (v1 stays; v2 is the new path).

**Gate (do not continue until all are true).**

- Log in as the seeded CEO with curl; `/api/auth/me` shows role `ceo` and the org.
- A user who belongs to two orgs gets a list, and `switch-org` changes the active org.
- A wrong password gives 401. A deactivated member is refused on the next request.
- A v1 login still works and a v1 cookie does not open v2.

**Rollback.** Flag off. The seed only touches the new database.

### Phase 4: Org settings and members

**Goal.** Manage people and org settings. Seat limits and role rules come from the database.

**Backend.**

- Members: list, read, create (CEO and COO), edit, deactivate, bulk suspend. Creating for an email that already exists attaches that person to this org (one login, many orgs). A new person gets an invite link from `password_resets` (`purpose = invite`). In development the link is printed to the log.
- Org: read settings and seat usage (`v_org_seat_usage`), edit settings (CEO), office networks, holidays, leave types and allowances.
- Downgrade helper: `v_downgrade_candidates` sorted by longest inactive, with bulk suspend.
- Never return `password_hash`. List columns explicitly.

**Frontend.**

- People list and detail, create member, org settings (work start, grace minutes, weekend days, workload thresholds, score weights), office IPs, holidays, leave types, seat bar with the 80, 95 and 100 percent states.
- Reuse `stat-tile`, `pagination`, `timezone-select`, `date-input` and the table styles.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/org` | all | Name, settings; seats for CEO and COO |
| PATCH | `/api/org/settings` | CEO |  |
| GET/POST/DELETE | `/api/org/office-networks` | CEO |  |
| GET/POST/DELETE | `/api/org/holidays` | CEO |  |
| GET/POST/PATCH | `/api/org/leave-types` | CEO |  |
| GET | `/api/members` | CEO COO MGR | Managers see people on shared projects |
| GET | `/api/members/:id` | CEO COO MGR | Self always allowed |
| POST | `/api/members` | CEO COO | Create or attach |
| PATCH | `/api/members/:id` | CEO COO MGR self | Role and switches CEO and COO only; managers edit simple profile fields |
| POST | `/api/members/:id/deactivate` | CEO COO | Frees the seat |
| POST | `/api/members/suspend` | CEO | Bulk, from the downgrade list |
| GET | `/api/members/downgrade-candidates` | CEO |  |
| POST | `/api/auth/accept-invite` | link | Sets the first password |

**Replaces in v1.** `GET/POST/PATCH /users*`, `GET /company/subscription`. `/users/managers` disappears (there is no reporting manager).

**Gate (do not continue until all are true).**

- The CEO creates an employee; the new person can set a password from the logged invite link.
- At the seat limit, creating a member returns 409 with "Seat limit reached".
- The org B CEO cannot see org A's members.
- Deactivating a member frees the seat.

**Rollback.** Flag off.

### Phase 5: Projects and invites

**Goal.** Projects with managers, leads, employees, invites and the completion flow.

**Backend.**

- Projects: list (scoped by role), read with members, flags (no manager, no employee) from `v_project_flags` and progress from `v_project_progress`, create (CEO), edit, archive (CEO), reopen.
- Members: CEO and COO add managers directly. Employees join through an invite (plan section 4). Remove sets `removed_at`. The lead tag is set by CEO and COO only.
- Invites: send, list mine, accept, decline with a reason, and review by the person who sent it (accept the decline, or overrule with a reason).
- Completion: every manager ticks, then a lead approves. With no lead the CEO or COO approves. A new task clears all ticks (database does this).

**Frontend.**

- Project list with progress bars, project detail (managers with a lead badge, employees, flags, tasks), invites inbox, completion panel. Reuse `status-badge`, `stat-tile`, `open-task-list` and `overdue-list`.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/projects` | all | Scoped by role |
| POST | `/api/projects` | CEO | COO goes through a request (Phase 7) |
| GET | `/api/projects/:id` | members |  |
| PATCH | `/api/projects/:id` | CEO COO lead |  |
| POST | `/api/projects/:id/archive` | CEO | Cancels open tasks |
| POST | `/api/projects/:id/reopen` | CEO COO |  |
| POST | `/api/projects/:id/members` | CEO COO | Managers directly |
| DELETE | `/api/projects/:id/members/:memberId` | CEO COO lead | Sets removed_at only |
| PATCH | `/api/projects/:id/members/:memberId/lead` | CEO COO | Body: isLead |
| POST | `/api/projects/:id/invites` | CEO COO MGR | A manager needs an approved request |
| GET | `/api/me/invites` | MGR EMP |  |
| POST | `/api/invites/:id/accept` | invitee |  |
| POST | `/api/invites/:id/decline` | invitee | Reason required |
| POST | `/api/invites/:id/review` | inviter | accept or overrule, with reason |
| POST | `/api/projects/:id/tick` | MGR | Every task must be Done or Cancelled |
| POST | `/api/projects/:id/complete` | lead, or CEO COO if no lead |  |
| POST | `/api/projects/:id/send-back` | lead CEO COO | Clears the ticks |

**Replaces in v1.** Nothing in v1 (projects are new).

**Gate (do not continue until all are true).**

- A COO cannot create a project directly (the database refuses).
- A declined invite is reviewed only by the person who sent it, and an overrule without a reason is refused.
- Completion: ticks, then lead approval; a project with no lead is approved by CEO or COO.
- Archiving cancels open tasks.

**Rollback.** Flag off.

### Phase 6: Tasks

**Goal.** Tasks that belong to projects, with several assignees, the new statuses and urgency.

**Backend.**

- Create inside a project. The assignees are managers and employees who are already project members.
- Status changes go through one endpoint. The database enforces the transitions and who may make them; the API passes the comment or reason.
- Flags from `v_task_flags`: no manager, no employee, overdue.
- `task_status_history` is read-only history.
- No delete route. Cancel instead.

**Frontend.**

- Task list with filters (project, mine, status, urgency), task detail with assignees, history and the allowed actions, task create. Rework `task-card`, `task-action-bar` and `status-badge` for the new statuses (`todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`) and urgency (`high`, `medium`, `low`). Drop `category-tag`.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/tasks` | all | Filters: project, mine, status |
| POST | `/api/projects/:id/tasks` | MGR CEO COO | Manager with the approval switch on passes an approved request id |
| GET | `/api/tasks/:id` | members |  |
| PATCH | `/api/tasks/:id` | MGR CEO COO |  |
| POST | `/api/tasks/:id/status` | per plan section 5 | Body: status, comment or reason |
| POST | `/api/tasks/:id/assignees` | MGR CEO COO | Body: memberId, role |
| DELETE | `/api/tasks/:id/assignees/:memberId` | MGR CEO COO | Sets removed_at only |
| GET | `/api/tasks/:id/history` | members |  |

**Replaces in v1.** `/tasks*`, `/tasks/assignment-requests*`, `/tasks/:id/status-changes`. `DELETE /tasks/:id` is not replaced.

**Gate (do not continue until all are true).**

- A task cannot start without both a manager and an employee.
- An employee cannot mark a task done. A manager not on the task cannot either.
- Sending a task back needs a comment; blocking needs a reason.
- A manager with the approval switch on cannot create a task without an approved request.

**Rollback.** Flag off.

### Phase 7: Requests inbox

**Goal.** One inbox for every request, with the apply step for each type.

**Backend.**

- File a request of any type from the plan (`create_user`, `create_project`, `add_to_project`, `create_task`, `assign_task`, `add_and_assign`). Build a `dedupe_key` from type, project, person and task so identical pending requests merge.
- Approve, reject (reason required), cancel. Bulk approve and reject with filters by project, manager and type.
- After approval, run the apply step in one transaction (database rule 7): `create_user` creates the user and member; `create_project` creates the project as the approving CEO; the requester performs `add_to_project`, `create_task` and `assign_task` and passes the request id.
- Show why a request cannot be decided by the current person: the database message says it.

**Frontend.**

- Requests inbox with tabs: mine, to decide. Filters, bulk select, approve and reject with a reason box. After an approval, a one-click "Send invite" or "Create the task" for the requester.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/requests` | all | scope = mine or to-decide |
| POST | `/api/requests` | MGR COO | Typed body |
| POST | `/api/requests/:id/approve` | per plan section 3 |  |
| POST | `/api/requests/:id/reject` | per plan section 3 | Reason required |
| POST | `/api/requests/:id/cancel` | requester |  |
| POST | `/api/requests/bulk` | approvers | ids, decision, reason |

**Replaces in v1.** `/tasks/assignment-requests*`.

**Gate (do not continue until all are true).**

- A manager with the switch on files `create_task`; the CEO approves; the manager creates the task; the request becomes applied.
- Nobody approves their own request except a CEO.
- A lead manager cannot approve `create_user`.
- A manager's new-user request holds a seat until it is decided.

**Rollback.** Flag off.

### Phase 8: Attendance

**Goal.** Check in from the office, correct mistakes by request.

**Backend.**

- Check-in inserts the day with the caller's IP (`req.ip` with `TRUST_PROXY`) and lets the database decide present or late and refuse outside office networks. Check-out updates the same row.
- Corrections are requests. On approval the approver applies the change with `corrected_by_request` set. There is no direct edit route.
- Read: my days, a person's days (CEO, COO, and managers for people on shared projects), monthly report as CSV.
- Leave and holidays appear from `v_approved_leave` and `org_holidays`; no placeholder rows are needed.

**Frontend.**

- Check-in card, month view, team view, correction dialog. Reuse `check-in-card`, `attendance-chart`, `attendance-insights`, `attendance-status` and `correction-dialog` with the new statuses. Remove the old inline edit.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| POST | `/api/attendance/check-in` | all | From an office network only |
| POST | `/api/attendance/check-out` | all |  |
| GET | `/api/attendance/me` | all | month |
| GET | `/api/attendance` | CEO COO MGR | memberId, month |
| POST | `/api/attendance/corrections` | all | Files the request and the correction row |
| GET | `/api/attendance/report` | CEO COO MGR | month, CSV |

**Replaces in v1.** `/attendance/*`. `PATCH /attendance/:recordId` is not replaced.

**Gate (do not continue until all are true).**

- Check-in from a non-office address is refused with a clear message.
- Checking in after the work start plus grace shows late.
- A correction request, once approved, changes the day and keeps the original in the history.

**Rollback.** Flag off.

### Phase 9: Leave

**Goal.** Leave requests that can actually be approved.

**Backend.**

- Create a leave request in one transaction: the `requests` row (type `leave`) and the `leave_requests` row. Count `days` as working days only, excluding weekends and holidays, with half days as 0.5. Set `over_allowance` when the balance is short.
- Balances from `v_leave_balance`. Cancel before the start date. Changing leave that has started is a `leave_change` request.
- Approval goes through the requests endpoints. The database picks who may approve: a lead on one of the person's active projects, or the COO. Someone on no project, or a lead, goes to the COO.

**Frontend.**

- Leave page with balances, a request form, my history, and for approvers a to-decide list. Show "On leave until" next to people in workload and calendar views.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/leave/balance` | all |  |
| GET | `/api/leave` | all | scope = mine, team or to-decide |
| POST | `/api/leave` | MGR EMP | Request plus leave row |
| POST | `/api/leave/:requestId/cancel` | requester | Before it starts |

**Replaces in v1.** `/employee-services/leave-requests`. Complaints stay in v1.

**Gate (do not continue until all are true).**

- A person on no project: only the COO or CEO can approve their leave.
- Overlapping approved leave is refused at approval.
- The balance drops after approval.

**Rollback.** Flag off.

### Phase 10: Calendar, meetings and workload

**Goal.** One calendar for tasks, meetings, leave and holidays, and the workload colours.

**Backend.**

- Calendar feed from `v_calendar_events`, limited to the caller (CEO and COO see everyone, managers see people on their projects).
- Meetings: create with title, time, invitees and either a link or a location. Create the meeting and invitees in one transaction.
- Workload from `v_member_workload`: open tasks, active projects, colour, and "on leave until".

**Frontend.**

- Replace the `calendar` stub with a month and week view. Meeting dialog with link or location. Workload chips on people and assignment pickers, with a warning when someone is on leave.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/calendar` | all | from, to |
| POST | `/api/meetings` | CEO COO MGR | Invitees required; link or location, not both |
| PATCH | `/api/meetings/:id` | creator |  |
| POST | `/api/meetings/:id/cancel` | creator |  |
| POST | `/api/meetings/:id/respond` | invitee | accept or decline |
| GET | `/api/workload` | CEO COO MGR | Managers see people on shared projects |

**Replaces in v1.** The `calendar` page stub.

**Gate (do not continue until all are true).**

- A meeting with neither link nor location, or with no invitee, is refused.
- Times show in each person's own time zone.
- The workload colour turns amber at 6 open tasks or 3 projects.

**Rollback.** Flag off.

### Phase 11: Ratings and performance

**Goal.** Anonymous ratings after a project completes, and the performance score for CEO and COO.

**Backend.**

- Ratings due: for a completed project inside the 7-day window, everyone rates the other side (employees rate managers, managers rate employees). One batch submit per project.
- The app role cannot read `project_ratings`. Use `v_rating_summary` for averages. Never expose who rated whom.
- Scores: read `v_performance_dashboard` and the breakdown columns of `performance_scores`. Only CEO and COO can read them (the database enforces it). Display as a number out of 100 with the band colours and a trend arrow.

**Frontend.**

- Ratings dialog when a project completes. A performance column in the people table and a breakdown drawer, shown to CEO and COO only.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/me/ratings-due` | MGR EMP |  |
| POST | `/api/projects/:id/ratings` | MGR EMP | Batch; 1 or 2 stars need a comment |
| GET | `/api/performance` | CEO COO |  |
| GET | `/api/performance/:memberId` | CEO COO | Breakdown |

**Replaces in v1.** The old attendance-only score formula (dropped).

**Gate (do not continue until all are true).**

- Ratings after the window closes are refused.
- An employee gets nothing from the performance routes.
- After running `job_compute_performance` for the org, the CEO sees scores and the COO does too.

**Rollback.** Flag off.

### Phase 12: Jobs, notifications and email

**Goal.** Everything that has to happen on its own.

**Backend.**

- Scheduler inside the API with a Postgres advisory lock. Each job loops `list_active_org_ids()`, sets `app.org_id` and leaves `app.member_id` empty.
- Every 5 minutes: `job_expire_pending()` (requests and invites past 3 working days), then notify the CEO, COO and managers involved.
- Hourly: reminders for High-urgency tasks still in To do after 24 hours (set `high_reminder_sent_at`). Subscription lifecycle: payment failed → 7 days grace → 10 days read-only → suspended → data kept 15 days.
- Daily: seat warnings at 80, 95 and 100 percent (once per level). End of each org's day: `job_auto_checkout`. Nightly: `job_compute_performance`.
- Notifications are rows in `notifications`. An outbox sender emails the ones that need it, respecting `notification_email_prefs` (people can mute everything except requests waiting on their decision). Invite and reset emails use `password_resets`.

**Frontend.**

- Notification bell and list, mark read, email preferences page.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/notifications` | all |  |
| POST | `/api/notifications/:id/read` | all |  |
| POST | `/api/notifications/read-all` | all |  |
| GET/PUT | `/api/notifications/email-prefs` | all |  |

**Replaces in v1.** Nothing (v1 has no jobs or email).

**Gate (do not continue until all are true).**

- A request whose `expires_at` is moved into the past expires on the next run and notifies the right people.
- Starting two copies of the API runs each job once.
- With `MAIL_TRANSPORT=log`, emails appear in the log and respect the mute preference.

**Rollback.** Turn the scheduler off with `HRMS_JOBS_ENABLED=false`.

### Phase 13: Security gate

**Goal.** The things the plan requires that must be finished before a real company uses this.

**Backend.**

- MFA with a time-based code for gameMaster, CEO and COO. The secret is encrypted with `MFA_ENCRYPTION_KEY` (AES-256-GCM) in `users.mfa_secret_enc`. First login forces enrolment. Login then asks for the code.
- History viewer for CEO and COO, and CEO notes on entries (the original entry never changes).
- CEO export of all org data, available during the 15 days after suspension.
- Rate limits on v2 sign-in routes (reuse the throttler).
- Review: no password or token in any response or log; temporary passwords are gone; every v2 route has a role check or is public on purpose; no route returns another org's data.

**Frontend.**

- MFA enrol and verify screens, history page, export button.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| POST | `/api/auth/mfa/enroll` | GM CEO COO |  |
| POST | `/api/auth/mfa/verify` | GM CEO COO |  |
| GET | `/api/audit` | CEO COO | Filters: table, person, date |
| POST | `/api/audit/:id/notes` | CEO | Add a note |
| POST | `/api/org/export` | CEO | Allowed while suspended |

**Replaces in v1.** Nothing.

**Gate (do not continue until all are true).**

- A CEO cannot finish login without a valid code.
- Original history rows cannot be changed, only noted.
- A reviewer pass over every v2 route lists no open findings.

**Rollback.** Flag off.

### Phase 14: GameMaster console

**Goal.** Create and manage orgs without ever seeing their data.

**Backend.**

- Everything here calls the `gm_*` functions, one per transaction, with `app.org_id` empty.
- Create an org with its first CEO (create the user first, then `gm_create_org`). Block or unblock. Change plan (`gm_set_org_plan`, which refuses a downgrade while over the new limit).
- Recovery: a COO files a CEO-recovery request (`POST /org/recovery-requests`) and a CEO files a last-CEO removal (`POST /org/last-ceo-removal`). The gameMaster verifies offline, then `gm_verify_platform_request`. Create a one-time link in `password_resets` (`purpose = ceo_recovery`) and email it to the new verified address. For removal, `gm_complete_remove_last_ceo`. Passwords are never shared.
- gameMasters: create one (pending), and a second gameMaster confirms.

**Frontend.**

- Platform console under `/hrms/platform`: orgs with CEO and COO counts and a warning over 25, plans, requests, gameMasters. No screen shows org data.

**Routes added.**

| Method | Path | Who | Note |
|---|---|---|---|
| GET | `/api/platform/orgs` | GM | Counts only |
| POST | `/api/platform/orgs` | GM | name, plan, CEO email and name |
| POST | `/api/platform/orgs/:id/block` | GM |  |
| POST | `/api/platform/orgs/:id/unblock` | GM |  |
| POST | `/api/platform/orgs/:id/plan` | GM |  |
| GET | `/api/platform/requests` | GM |  |
| POST | `/api/platform/requests/:id/verify` | GM |  |
| POST | `/api/platform/requests/:id/complete` | GM | Last-CEO removal |
| GET/POST | `/api/platform/game-masters` | GM |  |
| POST | `/api/platform/game-masters/:userId/confirm` | GM | A different gameMaster |
| POST | `/api/org/recovery-requests` | COO |  |
| POST | `/api/org/last-ceo-removal` | CEO |  |

**Replaces in v1.** All `/game-master/*` routes. The messages routes are not replaced. `DELETE /game-master/companies/:id` becomes block.

**Gate (do not continue until all are true).**

- A gameMaster reads zero rows from any org table.
- A new gameMaster cannot confirm themselves.
- A downgrade over the new limit is refused with the database message.
- Removing the last CEO works only after verification and ends with exactly one active CEO.

**Rollback.** Flag off.

### Phase 15: Cutover

**Goal.** Make the new system the default, with a way back.

**Backend.**

- Staging run: all gates green, rule tests green on a throwaway database, backup of both databases, the security review closed.
- Optional: import old data (last section).
- Set `HRMS_V2_ENABLED=true` and `NEXT_PUBLIC_HRMS_ENABLED=true` in production. Add `NEXT_PUBLIC_HRMS_DEFAULT=true` so `/login` sends people to `/hrms/login`.
- Leave v1 running untouched for at least two weeks. Nobody signs in there, but the way back stays open.
- Cleanup, only after that quiet period: delete the v1 modules, the old drizzle migrations, the complaints and messages code (or decide to keep them), old specs; update `CLAUDE.md`, `docs/production.md` and `.env.example`.

**Frontend.**

- The default entry points at the new login. Old pages remain reachable by direct URL until cleanup.

**Replaces in v1.** Everything in v1, after the quiet period.

**Gate (do not continue until all are true).**

- A real CEO logs in, creates a member, a project and a task end to end.
- Flipping `NEXT_PUBLIC_HRMS_DEFAULT` back to false restores the old login.

**Rollback.** Set `NEXT_PUBLIC_HRMS_DEFAULT=false`. v1 is untouched and its database was never changed. Data created in the new database stays there.

## Route map: v1 to v2

| v1 route | Fate | Replaced by | Phase |
|---|---|---|---|
| `POST /auth/login` | Rewrite | POST /api/auth/login (memberships, later MFA) | 3 |
| `POST /auth/refresh` | Rewrite | POST /api/auth/refresh | 3 |
| `POST /auth/logout` | Rewrite | POST /api/auth/logout | 3 |
| `POST /auth/change-password` | Rewrite | POST /api/auth/change-password | 3 |
| `GET /auth/me` | Rewrite | GET /api/auth/me | 3 |
| `GET /health` | Keep | Unchanged. v2 adds its own /api/health | 2 |
| `GET /company/subscription` | Rewrite | GET /api/org (seat usage, status) | 4 |
| `GET, POST, PATCH /users*` | Rewrite | /api/members* | 4 |
| `GET /users/managers` | Drop | No reporting manager in plan v3 | - |
| `POST /users/:id/reset-password` | Drop | Invite and reset links by email | 4 |
| `GET /tasks, /tasks/:id, /tasks/:id/activity` | Rewrite | /api/tasks* | 6 |
| `POST, PATCH /tasks` | Rewrite | /api/projects/:id/tasks, /api/tasks/:id | 6 |
| `DELETE /tasks/:id` | Drop | Cancel through the status route | 6 |
| `POST /tasks/:id/status-changes` | Rewrite | POST /api/tasks/:id/status | 6 |
| `POST /tasks/:id/comments` | Drop | Not in plan v3 (decision 3) | - |
| `GET, POST /tasks/assignment-requests*` | Drop | /api/requests* | 7 |
| `POST /attendance/check-in, /check-out` | Rewrite | /api/attendance/check-in, /check-out | 8 |
| `GET /attendance/me, /stats/*, /attendance` | Rewrite | /api/attendance* | 8 |
| `PATCH /attendance/:recordId` | Drop | Corrections are requests | 8 |
| `POST /attendance/corrections` | Rewrite | POST /api/attendance/corrections | 8 |
| `GET, POST /employee-services/leave-requests` | Rewrite | /api/leave* | 9 |
| `GET, POST /employee-services/complaints` | Keep in v1 | Not in plan v3 (decision 2) | - |
| `GET, POST /message-threads/*` | Keep in v1 | Not in plan v3 (decision 2) | - |
| `GET /dashboard/summary` | Rewrite | Built from the new views, per screen | 5 |
| `/game-master/companies*` | Rewrite | /api/platform/orgs* | 14 |
| `/game-master/companies/:id/admins*, reset-password` | Rewrite | Recovery requests and gm_complete_remove_last_ceo | 14 |
| `/game-master/subscriptions*` | Rewrite | POST /api/platform/orgs/:id/plan | 14 |
| `DELETE /game-master/companies/:id` | Drop | Block instead of delete | 14 |

## Cutover and rollback

- **Turn on in this order:** the API flag, then the frontend flag, then the default-login flag. Each can be turned off on its own.
- **Rolling back** never needs a database change. The old database was never touched, and the new one can stay as it is.
- **Do not run the rule tests on the real database.** They add sample data and change plan limits.
- **Changes after launch** are new numbered SQL files (`0003_...`), applied by `hrms-migrate.ts`. Never edit a file that has been applied.

## Optional: importing the old data

Only if the current data is real. Write `backend/scripts/import-legacy.ts`. It reads the old database (read-only) and writes the new one through the same context the API uses, so every rule applies to imported rows.

| Old | New | Notes |
|---|---|---|
| companies | orgs + org_settings | Start at active. Timezone and work start go to settings. |
| users (admin) | users + org_members as ceo | Old `admin` becomes `ceo`. A second admin becomes `coo` if you want one. |
| users (manager, employee) | users + org_members | `job_title` becomes `designation`. `manager_id` has no home and is dropped. |
| users (game_master) | users + game_masters | Bootstrap one, then use confirmation for the rest. |
| subscriptions | subscriptions + orgs.plan_code | Map free-text plan names to `standard` or `premium` by hand. |
| tasks | one project per company + tasks + task_assignees | A project named "Imported tasks" per org. Each task needs a manager and an employee; use the creator if a manager, else the project's first manager. Map `priority` to urgency and old statuses to the new ones. |
| attendance_records | attendance_days | Needs an IP address and status; mark imported rows with the office network's first address. |
| leave_requests | requests + leave_requests | Only approved or pending ones. Map the free-text type to a leave type. |
| task_activity | task_status_history | Status changes only. Comments are not ported. |
| complaints, messages, refresh_tokens | not imported | Sessions end at cutover. |
