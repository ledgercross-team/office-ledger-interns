# Migration audit: office-ledger-interns → HRMS schema v3

Read-only audit of branch `mah1uz` (HEAD `0307f47`), answering `requirements.md`. Nothing was installed, edited or run. Paths are relative to the repo root. Line numbers are given where I read the line; "not checked" means I did not verify it.

**Short version**
- The app is a working NestJS + Drizzle + Next app for a **one-company-per-user, 4-role** model (`game_master / admin / manager / employee`). The new design is **multi-org, 5-role, DB-enforced**. The schema, auth model, and every permission rule must change. Roughly 25–30% of the code (infrastructure, utilities, UI primitives) survives unchanged.
- There is **no RLS, no `SET LOCAL`, no audit log, no MFA, no org switcher**. All authorization is in app code.
- Leave requests can be **created but never approved** (no review endpoint exists). Complaints, messages and half the attendance UI have no equivalent in the new design.

---

## 1. Stack and tooling

| Item | Value | Source |
|---|---|---|
| Language / runtime | TypeScript `^6.0.2` (backend), `^5` (frontend); Node 24 | `.nvmrc`, `backend/package.json`, `frontend/package.json` |
| Backend framework | NestJS `^12.0.1` on Express `^5.3.0`, port 4000, prefix `/api/v1` | `backend/package.json`, `backend/src/main.ts` |
| Frontend | Next.js `16.4.0` (App Router), React `19.3.0`, Tailwind `^4`, TanStack Query `^5.104.1`, `motion ^14.1.0`. No UI library (own components in `frontend/src/components`) | `frontend/package.json` |
| Package manager | pnpm `10.0.0` workspace (`backend`, `frontend`) | `package.json`, `pnpm-workspace.yaml` |
| Build | `nest build` (backend), `next build` (frontend) | package scripts |
| Tests | Jest `^30` + ts-jest, `--experimental-vm-modules`; supertest e2e config at `backend/test/jest-e2e.json`. No frontend tests | `backend/package.json` |
| Lint | `oxlint --type-aware` (backend), ESLint 9 (frontend), Prettier | `backend/.oxlintrc.json`, `frontend/eslint.config.mjs`, `.prettierrc` |
| DB / ORM | PostgreSQL via `pg ^8.23.1`, `drizzle-orm ^0.45.4` | `backend/src/db/db.module.ts` |
| Migrations | `drizzle-kit generate` / `migrate`, 5 files in `backend/drizzle/` (0000–0004) | `backend/drizzle.config.ts`, `backend/drizzle/meta/_journal.json` |
| Auth | Passport local + JWT (`@nestjs/jwt`, HS256) in **httpOnly cookies** `access_token` / `refresh_token`; opaque refresh token with rotation + reuse detection | `backend/src/auth/token.service.ts:193-247` |
| Passwords | argon2 hash in `users.password_hash`. **No MFA anywhere** (no secret column, no code) | `backend/src/common/utils/passwords.ts`, `backend/src/db/schema/users.ts` |
| Refresh tokens | SHA-256 hashes in table `refresh_tokens` | `backend/src/db/schema/refresh-tokens.ts` |
| Queue / scheduler | **None.** No cron, no queue, no background jobs | not found |
| Redis | `ioredis ^6`; used **only** for the throttler storage; API refuses to start without it | `backend/src/modules/redis/*`, `app.module.ts` |
| Email | **None** | not found |
| File storage | **None** | not found |
| Hosting / deploy | No Docker. Docs only: `docs/production.md`. CI = lint, typecheck, test, build (GitHub Actions) | `.github/workflows/ci.yml` |
| Security middleware | helmet, CORS allow-list from `FRONTEND_URL`, `OriginCheckMiddleware` (CSRF-ish, Origin header), global ValidationPipe `whitelist + forbidNonWhitelisted` | `backend/src/main.ts`, `common/middleware/origin-check.middleware.ts` |

**Env variable names** (values not printed): backend `NODE_ENV, PORT, DATABASE_URL, REDIS_URL, FRONTEND_URL, JWT_ACCESS_SECRET, JWT_ACCESS_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, COOKIE_SECURE, COOKIE_DOMAIN, TRUST_PROXY, RATE_LIMIT_GLOBAL_PER_MIN, RATE_LIMIT_GLOBAL_BLOCK_SECONDS, RATE_LIMIT_AUTH_PER_MIN, RATE_LIMIT_AUTH_BLOCK_SECONDS, SEED_DEMO_PASSWORD`. Frontend `NEXT_PUBLIC_API_URL`. Validation in `backend/src/config/env.validation.ts`.

**Note:** `RATE_LIMIT_GLOBAL_BLOCK_SECONDS`, `RATE_LIMIT_AUTH_PER_MIN` and `RATE_LIMIT_AUTH_BLOCK_SECONDS` are read in `app.module.ts` but are not in `EnvironmentVariables` (only `RATE_LIMIT_GLOBAL_PER_MIN` is validated).

---

## 2. Database today

### Tables (`backend/src/db/schema/*.ts`)

| Current table | Key columns / relations | Maps to new | Notes |
|---|---|---|---|
| `companies` | `name, timezone, work_start_time, is_active` | `orgs` + `org_settings` | timezone / work start → `org_settings`; `is_active` → `orgs.status` (`active/grace/read_only/suspended/blocked`) |
| `users` | `company_id` (nullable), `role` (enum), `email` unique, `password_hash`, `full_name`, `job_title`, `is_active`, `must_change_password`, `token_version`, `last_login_at`, `created_by_id`, `manager_id` (same-company FK) | **split:** `users` (login) + `org_members` (org, role, status) + `game_masters` | Biggest change. One user row today = one org. `job_title` → `org_members.designation`. `manager_id` has **no equivalent** (employees now belong to projects). `is_active` → `org_members.status`. `must_change_password`/`token_version` have no column in new `users` |
| `subscriptions` | `company_id, plan_name (free text), starts_on, ends_on, cancelled_at, notes, created_by_id` | `subscriptions` + `plans` | `plan_name` string → `plans` FK; no seat limit exists today |
| `tasks` | `company_id, title, description, category (9 values), priority (low/med/high), status (6), deadline, assignee_id` (**single**), `created_by_id, completed_at` | `tasks` + `task_assignees` | Needs a `project_id` (tasks have no project today). `priority` → `urgency`. `category` has **no equivalent** in new schema |
| `task_activity` | `task_id, actor_id, type (comment/status_change), from_status, to_status, comment` | `task_status_history` (+ comments: **no equivalent** table) | New schema has history only; comments need a decision |
| `task_assignment_requests` | `manager_id, employee_id, task fields, status (pending/approved/rejected), reviewed_by_id, task_id` | `requests` (`create_task`/`assign_task`/`add_and_assign`) | Payload goes to `requests.payload` |
| `attendance_records` | `user_id, work_date, check_in_at, check_out_at, status (present/late), note, edited_by_id`; unique `(user_id, work_date)` | `attendance_days` + `attendance_corrections` | Direct edits (`PATCH /attendance/:id`) must become correction requests. No IP column today |
| `leave_requests` | `employee_id, leave_type (free text), start_on, end_on, reason, status, reviewed_by_id` | `leave_requests` + `leave_types` + `requests` | `leave_type` free text → FK to `leave_types`. Half-days not modelled |
| `complaints` | `employee_id, category, subject, details, status (open/in_review/resolved), response` | **no equivalent** | Drop, or keep out of scope |
| `messages` | `company_id, sender_id, body, read_at` (admin ⇄ game master thread per company) | **no equivalent** (closest: `notifications`, `platform_requests`) | The new design says gameMaster can never see org data; this thread is the only channel. Decide: drop or keep as a separate non-RLS table |
| `refresh_tokens` | `user_id, token_hash, expires_at, revoked_at, replaced_by_id, ip_address, user_agent` | **no equivalent** | Session storage is not in `hrms_schema.sql`. Keep this table (re-pointed at new `users.id`) or move to Redis |

New tables with **no current source** (will start empty): `plans`, `org_settings` (partly), `org_office_networks`, `org_holidays`, `projects`, `project_members`, `project_completion_ticks`, `project_invites`, `meetings`, `meeting_invitees`, `project_ratings`, `performance_scores`, `platform_requests`, `audit_log`, `audit_notes`, `notifications`, `notification_email_prefs`.

### Constraints worth knowing
- Cross-company safety today is done with **composite FKs** `(id, company_id)` (e.g. `tasks_assignee_same_company_fk`, `users_manager_same_company_fk`). New schema does the same with `(id, org_id)`, so the pattern carries over.
- `users_company_matches_role` check: `(role='game_master') = (company_id IS NULL)`. Incompatible with multi-org.
- Migration `0002` dropped `users_one_admin_per_company`, so multiple admins per company already exist.

### Data
Whether the data is real or test: **not checked** (I did not connect to a database; `.env.local` is gitignored and I did not read it). Indicators: `backend/src/db/seed.ts` inserts two demo companies (Acme, Globex) with users, subscriptions and tasks, and the seed is the documented dev workflow (`CLAUDE.md`). Treat everything as test data unless you know a deployed instance exists. Row counts: **not checked**. Run `SELECT relname, n_live_tup FROM pg_stat_user_tables` on the target DB to fill this in.

---

## 3. Backend and API

### Authorization today
1. Global guards in order (`backend/src/app.module.ts`): `AppThrottlerGuard` → `JwtAuthGuard` → `AccountStateGuard` → `RolesGuard`.
2. Routes are authenticated by default; `@Public()` opts out; `@Roles(...)` restricts by role string (`backend/src/auth/decorators/`).
3. **Row-level checks live in services**, not in the DB: e.g. `managedPeople()` in `backend/src/modules/users/visibility.ts` builds SQL for "who may this caller manage"; task permissions in `tasks/task-rules.ts`; `findVisibleUser` in `attendance.service.ts:510`.
4. The DB enforces only shape/tenant integrity (checks, composite FKs). It enforces **no** role or approval rules.
5. `AccountStateGuard` (`auth/guards/account-state.guard.ts`) enforces `mustChangePassword` and "subscription active" per request via a DB lookup.

### Errors and validation
- Errors: Nest exceptions → `{ statusCode, message, error }`; custom `code` for `PASSWORD_CHANGE_REQUIRED` and `SUBSCRIPTION_INACTIVE` (403). Frontend parses these in `frontend/src/lib/api-client.ts`.
- DB errors: only `isUniqueViolation` (`23505`) is mapped (`common/utils/db-errors.ts`). **New DB triggers will raise other SQLSTATEs; a mapper is needed.**
- Input: `class-validator` DTOs per module (`modules/*/dto/`), global `ValidationPipe`.

### Routes (all under `/api/v1`)

| Method + path | What | Who | File | Verdict |
|---|---|---|---|---|
| POST `/auth/login` | Passport local, sets cookies | public | `auth/auth.controller.ts:38` | **Rewrite**: multi-org membership list, MFA step |
| POST `/auth/refresh` | Rotate refresh token | public | `auth.controller.ts:67` | **Keep, adapt** (carry active org) |
| POST `/auth/logout` | Revoke token | any | `auth.controller.ts:74` | Keep |
| POST `/auth/change-password` | | any | `auth.controller.ts:82` | Keep, adapt (no `must_change_password` column) |
| GET `/auth/me` | Session + company info | any | `auth.controller.ts:97` | **Rewrite**: return memberships, active org/role |
| GET `/health` | | public | `health/health.controller.ts:12` | Keep |
| GET `/company/subscription` | Own sub status | admin | `company/company.controller.ts:12` | Rewrite (seats, grace/read-only states) |
| GET/POST `/game-master/companies` | List / create company (+ first admin) | GM | `game-master/game-master.controller.ts:33,38` | Rewrite → orgs + CEO invite |
| GET/PATCH/DELETE `/game-master/companies/:id` | | GM | `:43,48,53` | Rewrite. `DELETE` conflicts with "nothing is deleted" |
| POST/PATCH `/game-master/companies/:id/admins[/:adminId]`, POST `.../reset-password` | Manage company admins | GM | `:60,69,79` | Rewrite (CEO recovery goes through `platform_requests`; "passwords are never shared") |
| POST `/game-master/companies/:id/subscriptions`, PATCH `/game-master/subscriptions/:id` | | GM | `:87,96` | Rewrite (plan FK, seat limits) |
| GET `/dashboard/summary` | Role-specific counters | admin/manager/employee | `dashboard/dashboard.controller.ts:12` | Rewrite (needs projects, workload, requests inbox) |
| GET `/users`, `/users/assignable`, `/users/managers`, `/users/:id` | Directory | admin, manager | `users/users.controller.ts:18-42` | Rewrite over `org_members`. `/users/managers` goes away (no reporting manager) |
| POST `/users` | Create user, returns temp password | admin, manager | `users.controller.ts:31` | Rewrite: manager path must create a `create_user` **request** |
| PATCH `/users/:id`, POST `/users/:id/reset-password` | | admin, manager | `:47,57` | Rewrite |
| GET `/tasks`, `/tasks/:id`, `/tasks/:id/activity` | | admin/manager/employee | `tasks/tasks.controller.ts:32,78,115` | Keep but rewrite queries (projects, multi-assignee) |
| POST `/tasks` | Create; manager cross-team → request | admin, manager | `:38` | Rewrite (approval switch, `No assignee` flag) |
| GET `/tasks/assignment-requests`, POST `.../:id/approve`, `.../:id/reject` | | admin | `:44,53,62` | **Drop** → generic `/requests` endpoints |
| PATCH/DELETE `/tasks/:id` | | admin, manager | `:84,71` | Rewrite. Hard `DELETE` must become cancel |
| POST `/tasks/:id/status-changes` | State machine from `task-rules.ts` | all | `:94` | Rewrite (new statuses, `blocked`, `in_review`) |
| POST `/tasks/:id/comments` | | all | `:105` | Keep if comments are kept (no new table) |
| POST `/attendance/check-in`, `/check-out` | | manager, employee | `attendance/attendance.controller.ts:30,36` | Keep but rewrite (office-IP check, CEO/COO may check in) |
| GET `/attendance/me`, `/stats/me` | | manager, employee | `:43,49` | Keep but rewrite (new statuses, leave/holiday) |
| GET `/attendance`, `/stats/team`, `/stats/users/:id` | | admin, manager | `:71,55,61` | Rewrite (project-based visibility) |
| PATCH `/attendance/:recordId` | Direct edit of a record | admin, manager | `:77` | **Drop**: corrections are requests |
| POST `/attendance/corrections` | Create a missing day | admin, manager | `:87` | Rewrite → `attendance_correction` request by the employee |
| GET/POST `/employee-services/leave-requests` | | employee | `employee-services/employee-services.controller.ts:13,18` | Rewrite (managers also, `requests`, types, balances). **No approve/reject exists today** |
| GET/POST `/employee-services/complaints` | | employee | `:23,28` | **Drop** (no equivalent) |
| GET/POST `/message-threads/...` (`unread`, `:companyId/messages`, `mark-read`) | Admin ⇄ GM chat | GM, admin | `messages/messages.controller.ts:23-46` | **Drop or decide** (see §2) |

**Missing for the new design (no route exists):** projects, project members/invites, requests inbox + bulk decide, meetings/calendar, leave types/balances/holidays, org settings & office IPs, org switcher, MFA enrol/verify, notifications + email prefs, audit log/notes, performance scores, ratings, platform requests, CEO recovery, org export, seat warnings.

---

## 4. Business logic

| Concern | Where today | Status | Does the new DB make the app code unnecessary? |
|---|---|---|---|
| Approval flows | `tasks.service.ts:255-357` (`approveAssignment`/`rejectAssignment`), table `task_assignment_requests`. Only one request kind; admin only | Partial | **Mostly yes**: lifecycle, `decided_by`, rejection reason are `CHECK`s on `requests`. App still has to call the approve/apply functions and handle expiry/dedupe |
| Seat / subscription limits | **No seat limits.** Only a date window: `subscription-utils.ts` (`pickSubscription`, `daysLeft`), enforced in `AccountStateGuard` | Date only | Seat counting should be in DB; the app's date check is replaced by `orgs.status` (grace/read-only/suspended) |
| Task status changes | `modules/tasks/task-rules.ts` (pure, tested in `task-rules.spec.ts`), applied at `tasks.service.ts:409-455` | Yes, 6 statuses | **Yes** if triggers enforce the new transitions. Keep the file only as UI hint (`allowedActions`) |
| Attendance / check-in | `attendance.rules.ts` (late = start + 15 min, workdays Mon–Fri, stats), `attendance.service.ts:44-107` | Yes | Late grace, weekends, holidays, IP check become org settings/DB. Hard-coded `LATE_AFTER_MINUTES = 15` and `isWeekday` must go |
| Leave | `employee-services.service.ts:23-42` (create only) | Create only | Approval, balances and cancellation are all new |
| Performance scoring | **No scoring.** Only attendance "score = 50/35/15" in `attendance.rules.ts` (display stat) | No | New scoring (30/50/20) is nightly DB/job work. Drop the old formula |
| Notifications | None (only unread message count) | No | New |
| Audit logging | **None.** `edited_by_id`, `reviewed_by_id` columns only | No | `audit_log` + triggers; app only sets `app.*` |
| Visibility / scoping | `users/visibility.ts` (admin→managers+employees, manager→assigned employees); `common/utils/company-time.ts` | Yes | **Yes**, replaced by RLS + project membership. Delete `managedPeople` use |
| Time handling | `common/utils/company-time.ts`, `dates.ts` (company timezone, date math) | Yes | Reusable; add per-user timezone |

---

## 5. Frontend

**Pages** (`frontend/src/app`): `login`, `change-password`; under `(app)/`: `dashboard`, `tasks` (list, `[taskId]`, `new`), `attendance`, `team-attendance`, `calendar`, `leave-request`, `complaints`, `people` (list, `[userId]`, `new`), `subscription`, `messages`, and `game-master/*` (dashboard, companies list/new/`[companyId]`, messages).

**Main components** (`frontend/src/components`): `check-in-card`, `attendance-chart/insights/status`, `correction-dialog`, `task-card`, `task-action-bar`, `status-badge`, `category-tag`, `stat-tile`, `message-thread`, `open-task-list`, `overdue-list`, `temporary-password-panel`, `date-time-picker`, `timezone-select`, `hold-button`, `pagination`, `role-gate`.

**Data fetching / state:** TanStack Query with one `apiFetch` wrapper (`lib/api-client.ts`: `credentials: 'include'`, single-flight refresh on 401, typed `ApiError`). Session in `lib/auth-context.tsx` (query key `['auth','me']`, 5 min stale). No global store.

**Role knowledge:** `user.role` from `/auth/me` → `lib/navigation.ts` (`NAV_BY_ROLE`, `homePath`) and `components/role-gate.tsx`. `proxy.ts` only checks cookie presence. Role union type is `game_master | admin | manager | employee` in `lib/types.ts`.

| New-design screen | Status |
|---|---|
| Admin (CEO/COO) dashboard | **Partial**: `dashboard/page.tsx` exists, no requests/workload/performance widgets |
| Project views | **Missing** |
| Task views | **Partial**: list/detail/new exist, tied to single assignee, no project, old statuses |
| Requests inbox | **Missing** (only a small assignment-request list inside tasks) |
| Calendar | **Stub**: `calendar/page.tsx` has no API calls (not checked beyond that) |
| Leave | **Partial**: employee create/list only; no approver UI, no balances |
| Attendance | **Partial**: check-in card, history, team view, correction dialog; no IP/holiday/leave states, no monthly export |
| Performance view | **Missing** (only attendance insights) |
| Org switcher, MFA, org settings, audit log, notifications, meetings, ratings | **Missing** |
| Game master console | **Partial**: companies/messages exist; no plans, GM confirmation, platform requests |

---

## 6. Reuse, risks and gaps

### Reuse unchanged
- **Backend infra:** `main.ts` hardening, `config/env.validation.ts` (add new vars), `AppThrottlerGuard`, `RedisThrottlerStorage`, `OriginCheckMiddleware`, `common/utils/{passwords,dates,company-time,pagination,env}.ts` and their specs, `health` module, `@Public`/`@Roles`/`@CurrentUser` decorators, jest/oxlint/CI config.
- **Auth plumbing:** `token.service.ts` rotation + reuse-detection pattern (adapt claims).
- **Frontend:** `api-client.ts`, `query-provider.tsx`, `format.ts`, `date-input`, `date-time-picker`, `timezone-select`, `hold-button`, `pagination`, `stat-tile`, `status-badge`, `reveal`, layout/Tailwind setup, attendance chart components.
- **Tests:** specs for passwords, dates, company-time, throttler, origin check, env validation. `task-rules.spec.ts` / `attendance.rules.spec.ts` only as templates.

### Conflicts with the new design
| Conflict | Where |
|---|---|
| Role names `admin`, `game_master` vs `ceo/coo`, `gameMaster`; no COO | `db/schema/enums.ts`, `auth/auth.types.ts:6`, `lib/types.ts`, `lib/navigation.ts` |
| **One org per user** (`users.company_id`, JWT `companyId`) | `schema/users.ts`, `auth.types.ts` `JwtPayload` |
| Role is a user attribute; new role is per membership | `users.role` |
| `manager_id` reporting line | `schema/users.ts`, `visibility.ts`, `tasks.service.ts`, `users.service.ts:195,259,278` |
| Permissions only in app | all services |
| Single task assignee; no projects | `schema/tasks.ts` |
| Hard delete of tasks and companies | `tasks.controller.ts:71`, `game-master.controller.ts:53` |
| Admin can edit attendance directly | `attendance.controller.ts:77` |
| GM can create admins and reset their password, and GM↔admin messages | `game-master.service.ts`, `messages/*` (conflicts with "gameMaster can never see org data" / "passwords never shared") |
| Temp password handed to creator, `must_change_password` | `users.service.ts:145-180`, `temporary-password-panel.tsx` |
| Weekend = Sat/Sun, late grace = 15 min hard-coded | `attendance.rules.ts` |
| App connects as owner-like `office_ledger_app`; no `hrms_app` role | `.env.example`, `db.module.ts` |
| Drizzle schema + generated migrations vs one hand-written `hrms_schema.sql` (schema `hrms`, `citext`, triggers, RLS, views) | `backend/drizzle*`, `hrms_schema.sql:27-28` |

### Security observations
1. **`backend/.env.example` is committed with what looks like a real random `JWT_ACCESS_SECRET` (not a placeholder), a DB password and `SEED_DEMO_PASSWORD`.** Values not shown here. Rotate the secret if it was ever used anywhere, and replace it with an obvious placeholder.
2. Access token stores `role` and `companyId` in the JWT, but `AccountStateGuard`/`JwtStrategy` re-check state with `tokenVersion`; fine today, but new design needs per-request membership lookup (role can change between requests).
3. No MFA anywhere; required for GM/CEO/COO in the new plan.
4. No audit trail, so none of the "who/when/from where" history exists.
5. `OriginCheckMiddleware` lets requests with no `Origin` header through (documented choice, fine for cookie CSRF with `SameSite=Lax`).
6. `proxy.ts` trusts cookie *presence* only (acceptable, API is authoritative).
7. `isUniqueViolation` is the only DB error mapping; RLS/trigger failures would surface as 500s.
8. Env validation gap noted in §1 (three rate-limit vars unvalidated).
9. Temporary passwords are returned in an API response and shown in the UI (`temporary-password-panel.tsx`); replace with email invite/reset link.

### Needed by new design, no code exists
- **Per-request transaction wrapper** running `SET LOCAL app.org_id / app.member_id / app.user_id / app.client_ip` (use `set_config(..., true)`), with every query going through that transaction. Today `DRIZZLE` is a single shared pool handle (`db.module.ts`) used directly in services, so this is a cross-cutting change (e.g. a request-scoped transaction provider or `AsyncLocalStorage`).
- System context (`app.member_id` unset = `is_system()`) for jobs and login lookups.
- Background jobs: request expiry (3 working days), invite expiry, auto check-out, nightly performance scores, seat warnings, grace/read-only/suspend transitions, 15-day export window. Needs a scheduler (nothing today) and email transport.
- MFA (TOTP) enrol/verify with encrypted secret storage (`mfa_secret_enc`).
- Org switcher: login returns memberships; token/session carries `memberId`.
- Mapping of DB exceptions (check/trigger/RLS) to HTTP 4xx.
- Client IP handling: `TRUST_PROXY` exists; need to feed `req.ip` into `app.client_ip` and into office-network check.
- Export (CEO data export), report export (monthly attendance).

---

## 7. Suggested order of work

Each step ends with something you can run or test.

1. **Load the schema in a throwaway DB.** Create a fresh database, run `hrms_schema.sql` as owner, confirm `hrms` schema, `hrms_app` role exists. Create a login role that inherits `hrms_app`. *Test:* `\dt hrms.*` shows all 30 tables.
2. **Freeze the old model.** Branch from `main`; stop using `drizzle-kit generate`. Decide: hand-written SQL migrations (recommended, as the schema has triggers/RLS Drizzle can't express) and keep Drizzle only as a query builder, or drop Drizzle. Document in `docs/`.
3. **Point the backend at the new DB** via a new `DATABASE_URL` using the `hrms_app`-based login. Replace `backend/src/db/schema/*` with a Drizzle definition of the new tables (introspect with `drizzle-kit pull`, then trim). *Test:* `pnpm typecheck` (expect many errors; they are your work list).
4. **Add the request-context transaction.** One `DbContext` provider (AsyncLocalStorage + interceptor) that opens a transaction and runs the three `SET LOCAL`s. *Test:* a spec that selects `current_org_id()` inside a request and sees the right value; a second org's rows are invisible.
5. **Seed script for the new schema:** one gameMaster (bootstrap), one org, a plan, CEO/COO/manager/employee members. Reuse the idempotent pattern from `backend/src/db/seed.ts`. *Test:* `pnpm db:seed` twice, no errors.
6. **First login works.** New `AuthService.validate` (look up `users` by email, `org_members` list), JWT carries `sub` + `memberId` + `orgId`; `/auth/me` returns memberships; `AccountStateGuard` reads `orgs.status`. Skip MFA initially. *Test:* login as the seeded CEO via curl, `GET /auth/me`.
7. **Role/guard rename.** `Role` → `gameMaster|ceo|coo|manager|employee`; update `@Roles` usages and frontend `types.ts`/`navigation.ts`. Delete `visibility.ts` use. *Test:* existing role-guard specs updated and green.
8. **Org switcher + MFA.** `POST /auth/switch-org`, TOTP enrol/verify for GM/CEO/COO. *Test:* login as CEO requires a code.
9. **Members and users:** rewrite `users` module over `org_members` (create, deactivate, simple profile edits). Manager creation goes via a `create_user` request. *Test:* seat limit refusal comes from the DB.
10. **Projects + project members** (new module, list/create/archive, lead tag, completion ticks). *Test:* RLS hides another org's projects.
11. **Tasks on projects** with `task_assignees`, new statuses, `task_status_history`. Remove `task_assignment_requests` code. *Test:* illegal transitions are rejected by triggers and mapped to 4xx.
12. **Generic `/requests` module** (list inbox, approve/reject/cancel, bulk). Retire `tasks/assignment-requests` routes. *Test:* manager with approval switch ON creates a task → pending request → CEO approves → applied.
13. **Attendance** on `attendance_days`, office-IP check-in, corrections as requests. Remove `PATCH /attendance/:id`. *Test:* check-in from a non-office IP is refused.
14. **Leave** on `leave_types` / `leave_requests` / `requests`, with approver UI. *Test:* approved leave appears as `on_leave` in attendance.
15. **Scheduler + jobs** (expiry, auto check-out, nightly performance, seat warnings), then **notifications + email**. Pick the scheduler and mail provider first (decision needed; none exists).
16. **Calendar/meetings, ratings, performance view, audit log + notes UI.**
17. **Game master console:** orgs, plans, GM confirmation, platform requests (CEO recovery); remove the old company-admin and messages endpoints.
18. **Frontend pass per screen** following the order above; reuse components listed in §6.
19. **Cleanup:** delete old drizzle migrations/snapshots, `complaints`/`messages` code (if dropped), old specs; update `CLAUDE.md`, `docs/production.md`, `.env.example` (placeholder secret).

### Decisions you need to make before step 3
1. Keep **Drizzle** (introspected from `hrms_schema.sql`) or switch to plain SQL/another builder?
2. **Complaints** and **GM⇄admin messages**: drop, or keep as extra tables outside the schema?
3. **Task comments**: new schema has `task_status_history` only; add a comments table?
4. **Task categories** (9 HR tags): keep as a column, or drop?
5. **Session storage:** keep `refresh_tokens` table or move to Redis (the schema has none)?
6. **Scheduler and email provider** choice.
7. **Existing data:** migrate it (script: `companies→orgs`, `users→users+org_members`, `admin→ceo`) or start fresh since it is probably demo data.
