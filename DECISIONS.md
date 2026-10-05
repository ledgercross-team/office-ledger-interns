# Decisions

Defaults and judgement calls made while building Office Ledger v2. Newest phase last.

## Phase 1 – Scaffold & tooling

- **Astro 5.18** (not the newer Astro 7) because the brief pins Astro 5; matching adapters are `@astrojs/node@9`, `@astrojs/react@4`. **TypeScript 5.9** (TS 7's native compiler is not yet supported by `astro check`). **TanStack Table v8** (stable, widely documented) and **Vitest 3**.
- **Zod 3** for app code because Astro 5 Actions bundle Zod 3 (`astro:schema`); Better Auth carries its own Zod 4 internally.
- **Node adapter in `middleware` mode** + a tiny `server.mjs` (Node `http` + `sirv`) so security headers apply to prerendered marketing pages and static assets too, not only SSR responses.
- **No inline scripts on static pages**: the theme bootstrap is `/theme.js` (render-blocking, ~600 B) and `vite.build.assetsInlineLimit = 0` keeps Astro's processed scripts external. SSR pages get a per-request nonce for Astro's island hydration scripts (see Phase 3).
- **CSP `style-src` allows `'unsafe-inline'`**: React and Recharts emit inline style attributes; styles cannot execute script. `script-src` stays strict (`'self'` + nonce + `'strict-dynamic'`).
- **Docker-free local Postgres**: Docker needs root on some machines, so `pnpm db:local` starts a real Postgres 16 via the `embedded-postgres` npm package with the same credentials as `docker-compose.yml`. Unit tests use the same mechanism on port 54329 unless `TEST_DATABASE_URL` is set (CI uses a Postgres service).
- **Theme**: `light | dark | system`, stored per user (`users.theme`) and mirrored to a `theme` cookie so the server can render `data-theme` without a flash.
- **Status colours**: the brief lists violet for "late/reviewing" but the status-pill list says Late = amber. Pills follow the pill list (Late amber, On leave violet); violet is also used for "reviewing" complaints.

## Phase 2 – Database & resolvers

- **IDs**: Better Auth tables use its default text IDs; every domain table uses `uuid` (`gen_random_uuid()`).
- **Snake-case columns** via Drizzle `casing: "snake_case"`; table names follow the brief (Better Auth models are mapped `user → users`, `verification → verification_tokens`, `twoFactor → two_factors`).
- **SQL resolvers live in `src/db/sql/*.sql`** and are re-applied (idempotently) after drizzle-kit migrations on every `pnpm db:migrate`, so editing a resolver never needs a hand-written migration.
- **`v_dashboard_today`** is a view over `fn_dashboard_today(workspace_id, days)` because views cannot take parameters; the 30/90-day chart toggle calls the function directly.
- **Owners are not tracked** in attendance metrics (coverage, ranking, absences). They can still check in.
- **"Effective end"** for expectations: today counts only after office end time; otherwise the period is capped at yesterday. Prevents a mid-morning view from showing everyone under-productive.
- **Rejected late/remote check-ins count as absent** in every metric.
- **Productivity index is capped at 100** so overtime cannot hide attendance penalties; with zero expected minutes (e.g. full leave) the performance index equals the attendance index.
- **Approved leave writes `on_leave` attendance rows** for each workday (half-day leave sets `half_day`), so attendance tables and metrics see leave without joins.
- **Absent** = a workday (from the joining date) with no non-absent attendance row.
- **Daily report "Holidays (n active)"** counts active holidays in the report's month.
- **Exceptions** (Inbox → Exceptions) are computed in `v_inbox_items` over the last 14 days (absences over the last 7 workdays); acknowledging one writes `exception_acks`.
- **Overtime** = tracked > window + 120 min; **anomaly** ("short day") = < 60 min tracked on a non-half-day.
- **RLS**: policies on every table with `workspace_id`, applied to the `ledger_app` role. Request code calls `withWorkspace()` which does `set local role ledger_app` + `set_config('app.workspace_id')`. The connecting owner role (auth, jobs, seed) is unrestricted. Views use `security_invoker`.
- **`fn_now()`** reads `app.now` when set so resolver tests can pin the clock.
- **Seed** is deterministic (fixed PRNG); demo password `Ledger#2026`, invite code `LEDGER-7Q4K`, timezone Asia/Dhaka, weekend Fri+Sat.

## Phase 3 – Auth, roles, middleware

- **Own membership model instead of Better Auth's organization plugin**: the brief's `memberships` table carries HR fields (employee code, department, manager, status workflow) that the plugin doesn't model. Better Auth handles identity (users, sessions, accounts, verification, 2FA); `src/lib/context.ts` resolves the active workspace per request.
- **Active workspace** is stored on `users.active_workspace_id` (workspace switcher updates it).
- **Argon2id** via `@node-rs/argon2` (m=19 MiB, t=2, p=1) plugged into Better Auth's `password.hash/verify`. Better Auth's built-in default is scrypt, so the brief's "(Better Auth default)" note was corrected.
- **Account lockout**: 5 consecutive failed email sign-ins lock the account for 15 minutes. Implemented in the `/api/auth/[...all]` wrapper (with per-IP rate limiting), and the error stays generic ("Invalid email or password").
- **Email verification** is configurable (`REQUIRE_EMAIL_VERIFICATION`, default off in dev so demo logins work); verification and reset emails are always sent.
- **Session cookies**: prefix `ledger.`, HttpOnly, SameSite=Lax, Secure in production; 14-day sessions with a 60 s signed cookie cache. Astro's `security.checkOrigin` covers CSRF for actions/forms.
- **CSP nonce**: middleware generates a per-request nonce and adds it to every `<script>` in SSR HTML; `'strict-dynamic'` lets island chunks and View Transitions load. Dev mode adds `'unsafe-eval'` + `ws:` for Vite HMR only.
- **Invite codes** look like `WORKSPACE-7Q4K` (no ambiguous characters). Join requests via code are `pending`; email invite links (7-day expiry) activate the membership immediately with the pre-assigned role/department because an owner/manager issued them.
- **Route guard order**: signed out → sign-in; no/revoked membership → `/auth/join`; pending → `/auth/pending`; owner of a not-yet-onboarded workspace → `/auth/setup`; role not allowed → 403 page (rewrite, same URL).
- **Managers can only manage employees** (not owners or other managers) and cannot review their own or other managers' requests; only owners decide holiday proposals.

## Phase 4 – App shell

- **Sidebar is server-rendered Astro** (zero JS for navigation); collapse state lives in `localStorage` and is applied before paint by `/theme.js`. Under 1024 px it becomes an off-canvas drawer; under 640 px a bottom tab bar appears (employees get _Leave_ in place of _Inbox_).
- **One QueryClient for all islands** (module singleton that survives View Transitions). Islands seed queries with SSR data; the SSE stream (`/api/stream`) sends `invalidate` topics so every island refreshes the right queries live.
- **Real-time** uses Postgres `LISTEN/NOTIFY` (`ledger_events`) so it works across multiple app instances. Each Web Push is "claimed" (`notifications.pushed_at`) so only one instance sends it.
- **Announcements render markdown on the server** through `marked` + DOMPurify with a strict tag/URL allow-list; that sanitised HTML is the only HTML ever injected.
- **Inbox visibility** (`src/lib/queries/inbox-scope.ts`) mirrors `can("inbox.review")` in SQL so badge counts and lists agree.

## Phase 5 – Attendance, employees, profiles

- **Late rule**: a check-in is late when local time > office start + threshold; `late_minutes` is measured from office start. Half-day rows (approved half-day leave) are never late.
- **Status precedence**: late beats remote (a late remote check-in shows _Late_ with mode _Remote_); the _Remote_ tile counts by mode.
- **Approval policy** (`approval_mode`): none / late / remote / both. Going over the weekly remote quota (Monday-based week) always requires approval, whatever the mode.
- **Geofence / office IP** is off by default. When on, an _Office_ check-in must come from an allowed IP **or** a browser location within the radius; otherwise the user is asked to choose Remote.
- **Breaks**: started/ended by the employee (optionally tagged with a configured break window); break minutes are subtracted from tracked time.
- **Corrections** never edit history directly. Approval applies them to the attendance row, and if that day's report is already locked, a `daily_report_corrections` entry is written.
- **Employee codes** continue the workspace's existing prefix (`LC-016`, …) on approval or import; owners get `OWN-001` from the setup wizard.
- **CSV import** creates accounts with a random password and emails each new person a reset link to choose their own; existing members are skipped.
- **Deactivation** deletes the member's sessions immediately.
- **Documents** are stored outside `public/` (`STORAGE_DIR`), checked against a MIME allow-list _and_ magic bytes, and served only through HMAC-signed URLs that expire after 5–10 minutes with a sandboxed CSP. Avatars use an authenticated route instead because colleagues need to see them.
- **2FA** setup is offered to owners and managers (per the brief); employees don't see it.
- **Profile visibility**: employees can only open their own profile (`/app/me`); managers and owners can open anyone's, and only someone with permission to manage that person sees their documents and emergency contact.

## Phase 6 – Leave & Inbox

- **One decision layer** (`src/lib/services/decisions.ts`) is used by the Inbox _and_ the source pages, so "Approve" means exactly the same thing everywhere (permissions re-checked against the source record, requester notified, audit written).
- **Bulk Inbox decisions** run each item in its own savepoint; stale or forbidden items are skipped and reported instead of failing the batch.
- **Button wording by kind**: exceptions are _Acknowledge / Flag_ (flagging notifies the employee to file a correction or leave), complaints are _Start review / Close_, everything else is _Approve / Reject_. A rejection reason is optional and goes to the requester (in-app and, if they opted in, by email).
- **Priority**: leave starting within 2 days and absences without leave are High; joins, corrections, holiday proposals and missing checkouts are Medium; attendance approvals, overtime and short days are Low; issues map from their severity. SLA badges turn amber after 1 day and red after 3.
- **Leave days** count workdays only (weekends and active holidays excluded); half-day = 0.5. Requests may reach 30 days back and up to a year ahead, can't overlap the member's own pending/approved requests, and paid types with a quota can't exceed the available balance (accrued + carry-over − used − pending).
- **Overlap warning** shows on pending requests when other members of the same department are off (approved or pending) on overlapping days; it turns amber at 2+ people or ≥30% of the department.
- **Approving leave after the day's report locked** adds a correction entry to that report.

## Phase 7 – Taskboard & Calendar

- **Task permissions**: employees can create tasks (always assigned to themselves) and update tasks they're assigned to or created; owners/managers can assign anyone and archive. Archived tasks are read-only history with a Restore action.
- **Ordering** uses a floating `position` per column (midpoint between neighbours on drop), so a move is one row update. Moves are optimistic and roll back on error. Keyboard drag (space, arrows) is supported through dnd-kit's keyboard sensor.
- **@mentions** accept `@First` or `@[Full Name]` (the composer inserts the bracketed form); mentioned people and assignees are notified separately.
- **"Due soon"** badges: overdue (red), due within 2 days (amber). Reminder notifications are sent by the daily job (Phase 8).
- **"Daily" meetings mean every working day**: configured weekend days are skipped in the UI, the daily report's meeting count, and the ICS `RRULE` (`BYDAY`). Holidays are not excluded from recurring meetings.
- **Meeting visibility**: owners/managers see all meetings; employees see the ones they're invited to.
- **Holiday flow**: owner changes are immediate; a manager's mark becomes a proposal and a manager's removal becomes a removal request, both decided by the owner in the Inbox. A manager can withdraw their own pending proposal.
- **Public holiday import** uses the free Nager.Date API for the workspace country (global holidays only); imported days are active for owners and proposals for managers. Existing dates are left untouched.
- **iCal feed** (`/api/ical/<token>`) contains the member's meetings (with RRULE), their approved leave and active holidays as all-day events, from 90 days back. The token is the secret and can be reset from My Profile.

## Phase 8 – Performance, Daily Report, Dashboard, jobs

- **Chart colours = attendance status tokens** (Present green, Late amber, Remote blue, On leave violet, Absent red), validated as a set with the dataviz palette validator in both themes. Dark mode needed its own steps (`--success: oklch(0.52 0.13 158)`, `--warning: oklch(0.665 0.15 62)`) to stay inside the dark lightness band and keep green/amber apart for protanopes. Remote↔On leave sits in the 6–8 CVD band, so every chart carries a labelled legend with counts, 2px surface gaps, hover tooltips and a table view.
- **Attendance momentum** plots working days only (weekends/holidays would show as fake drops), with 7/30/90-day ranges and optional Late/Remote series. Charts use one y-axis.
- **Worked rate** = minutes worked so far today by people who checked in ÷ (people present × office minutes elapsed), capped at 100%.
- **Performance trend**: the sparkline shows six consecutive periods of the selected length ending at the selected end date; the delta compares with the immediately preceding period. **PDF export** uses the print stylesheet (browser "Save as PDF") to avoid a server-side PDF engine.
- **Employees see only their own score** on the Performance page (with formulas spelled out).
- **Daily report locking**: the `lock-reports` job snapshots `fn_daily_report` at office end (workspace timezone). Past days that were never locked (e.g. the server was down) lock lazily the first time they're opened, so their snapshot reflects that moment. Live reports refresh every minute.
- **Weekly/monthly roll-ups** aggregate `fn_attendance_summary` over Monday-based weeks or calendar months, capped at today.
- **Jobs** run every minute via node-cron inside the server (`JOBS_ENABLED`) or `POST /api/cron/<job|all>` with `Authorization: Bearer $CRON_SECRET`. Once-a-day work (digest) is recorded in `job_runs`; report locks rely on the snapshot's unique key, and due reminders on `tasks.due_reminder_sent_at`. All jobs are idempotent.
- **Auto-checkout** closes open sessions at `auto_checkout_at` (and any left over from earlier days), but records the checkout at office end so forgotten checkouts don't count as overtime. The day still appears as a _missing checkout_ exception and the member is notified.
- **Expired invite codes** are rotated automatically and the owner is notified.
- **Dashboard celebrations** show birthdays and work anniversaries in the next 14 days to everyone in the workspace (birth year is never shown).
- **Astro + `asChild`**: Radix `Slot` can't wrap Astro slot content, so `.astro` files style links with `buttonVariants()` instead of `<Button asChild>`.

## Phase 9 – Complaints, Settings, Audit log

- **Anonymous issues**: managers always see "Anonymous"; the owner sees the name only if _Settings → Notifications → Owner can see anonymous submitters_ is on (off by default). The submitter always sees their own issue.
- **Issue workflow**: new → reviewing → resolved; resolving requires a message to the submitter. Notes are internal by default; a toggle sends a visible message instead. Processors can't act on issues they submitted themselves. Categories are configurable.
- **Settings are owner-only to change**; managers get a read-only view (the brief's banner). Every change is written to the audit log with a before → after diff of the changed keys.
- **Leave types with history are deactivated, not deleted**, so past requests keep their label.
- **Members & roles**: the owner can switch members between manager and employee and transfer ownership (type `TRANSFER` to confirm; the old owner becomes a manager).
- **Export** (`/api/export`) is a ZIP of one CSV per tenant table, read through the RLS-scoped role. Secret columns (iCal tokens, invite tokens, storage keys, the invite code) are omitted. **Delete workspace** requires typing the workspace name and cascades everything, including its audit log (a console line records who did it).
- **Audit log** loads the last 30 days by default (up to 5,000 events per range) with client-side filters and CSV export.
- **Deep-linked dialogs** (`?task=`, `?id=`, `?new=1`) open after hydration so server HTML matches the client.
- **Dev hot reload** caches only the Postgres pool, not the Drizzle instance, so schema edits apply without restarting.

## Phase 10 – Marketing site, SEO, PWA, security files

- **Marketing pages are prerendered and ship no JavaScript** apart from the 600-byte theme bootstrap; FAQ uses `<details>`. Screenshots are real app captures (`scripts/capture-screenshots.ts`) optimised to WebP by Astro `<Image>`, with a dark-mode variant.
- **`robots.txt` and `/.well-known/security.txt` are prerendered endpoints** (not static files in `public/`) so the sitemap URL and canonical domain always follow `PUBLIC_SITE_URL`. `security.txt` `Expires` is one year from the build date.
- **`/.well-known/change-password`** redirects to `/auth/forgot` (the reset-request page), per the W3C well-known URL spec.
- **Contact form** is a plain HTML form posting to `/api/contact` (rate-limited, honeypot, emails the team, then redirects to `/contact/thanks`), so the page stays static.
- **Pricing** is a labelled placeholder.
- **Service worker** is hand-written (no build plugin): precached offline page, cache-first for hashed assets/icons, network-first for `/app` pages with an offline fallback; `/api`, `/auth` and `/_actions` are never cached. Signing out clears cached app pages. It's registered only in production builds so it never interferes with Vite in dev.
- **Icons and OG image** are generated from one SVG with `sharp` (`pnpm icons`); `favicon.ico` holds PNG images (16/32/48).
- **HSTS and `upgrade-insecure-requests`** are only sent when `PUBLIC_SITE_URL` is HTTPS, so plain-HTTP previews still work.
