# Office Ledger v2

A multi-tenant workspace for small and mid-sized offices: attendance, leave, tasks, calendar, complaints, performance and end-of-day reporting, with role-based access for **Organization Owners**, **Managers** and **Employees**.

Built with Astro 7 (SSR) + React 19 islands, Tailwind CSS v4, PostgreSQL 16 + Drizzle ORM, Better Auth, TanStack Table/Query, Recharts and dnd-kit.

---

## Quick start

```bash
cp .env.example .env            # then set BETTER_AUTH_SECRET, FILE_SIGNING_SECRET, CRON_SECRET (openssl rand -base64 32)
docker compose up -d            # Postgres 16 + Mailpit (http://localhost:8025)
pnpm install
pnpm db:migrate
pnpm db:seed                    # workspace "Ledgercross" with 90 days of data
pnpm dev                        # http://localhost:4321
```

No Docker? `pnpm db:local` starts a real Postgres 16 (from the `embedded-postgres` package) on port 5432 with the same credentials. Leave it running in its own terminal.

### Demo logins

All demo accounts use the password **`Ledger#2026`**. Invite code: **`LEDGER-7Q4K`**.

| Role                 | Email                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| Owner                | `owner@ledgercross.test`                                                     |
| Manager              | `manager@ledgercross.test`, `manager2@ledgercross.test`                      |
| Employee             | `employee@ledgercross.test` (and 11 more, e.g. `kamal@`, `sadia@`, `lamia@`) |
| Pending join request | `pending@ledgercross.test`                                                   |

---

## Features

**EXISTING**: kept from v1 (behaviour and data model preserved, UI refreshed). **IMPROVED**: v1 feature with an upgrade. **NEW**: did not exist in v1.

| Area              | What's there                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell         | **EXISTING** sidebar groups (Main / Operations / Reports / Workspace), role-filtered nav, user chip, notifications, announcements · **NEW** collapsible icon rail, mobile drawer, phone bottom tab bar, workspace switcher, light/dark/system theme saved per user, ⌘K / Ctrl+K command palette (pages, people, tasks, _Check in_, _New task_, _Request leave_), real-time updates over SSE, Web Push, email digests                         |
| Onboarding & auth | **EXISTING** invite code → _Pending_ until approved · **NEW** regenerate/expire codes, email invite links with preset role/department, three-step setup wizard, email verification, password reset, TOTP 2FA (owners & managers), session list with "sign out other devices", account lockout                                                                                                                                                |
| Dashboard         | **EXISTING** coverage %, worked rate, Late/Remote/On leave/Absent tiles, inbox banner, 7-day momentum chart, operations mix, invite code, attendance card, daily briefing with Copy · **IMPROVED** 7/30/90-day ranges with Late/Remote series, deltas vs the last workday · **NEW** who's out today, upcoming holidays, birthdays and work anniversaries, employee dashboard (streak, hours this week, leave balance, my tasks, my meetings) |
| Inbox             | **EXISTING** Decisions / Reviews / Exceptions tabs, cards with priority, Approve / Reject / Open source, multi-select bulk actions · **NEW** rejection reason sent to the requester, keyboard triage (J/K/X/A/R), type/department/priority filters, "waiting 2d" SLA badges, computed exceptions (missing checkout, absent without leave, overtime, short days)                                                                              |
| Employees         | **EXISTING** Active / Pending / Rejected tabs, search + department/designation filters, employee table · **NEW** Deactivated tab, CSV import with preview/validation, CSV export, inline departments & designations, org chart                                                                                                                                                                                                               |
| Profiles          | **EXISTING** header, contact/personal/employment panels, stat tiles, employment summary, working hours, 90-day attendance record, company-info editing · **NEW** 13-week attendance heatmap, leave balances, emergency contact, private document vault (signed URLs), activity timeline, avatar upload, security & notification preferences, iCal feed URL                                                                                   |
| Attendance        | **EXISTING** Office/Remote check-in, late rules from Settings, success panel with check-out, today's log, manager approval for late/remote · **NEW** break tracking, optional office IP/geofence verification, correction requests (never rewrite history), auto-checkout with missing-checkout flags, weekly remote quota                                                                                                                   |
| Leave             | **EXISTING** full-day and half-day tabs, Pending/Approved/Rejected tiles, filter chips, review cards, employee form and history with cancel · **NEW** configurable leave types and quotas, balances with monthly/yearly accrual, department overlap warnings, attachments, approved leave feeds the calendar and attendance                                                                                                                  |
| Taskboard         | **EXISTING** kanban (To do / In progress / Blocked / Done), active/archived, priorities, assignees, due dates, labels · **NEW** dnd-kit drag and drop with optimistic updates and keyboard support, checklists, comments with @mentions, attachments, list and My tasks views, filters, due-soon reminders                                                                                                                                   |
| Calendar          | **EXISTING** Meetings / Approved leave / Holiday calendar tabs, month grid with weekends, selected-day panel, owner vs manager holiday rule · **NEW** week view, recurring meetings, RSVP, ICS export, per-user iCal feed, public holiday import                                                                                                                                                                                             |
| Performance       | **EXISTING** explainer, timeline selection, tiles, compact filters, ranking table, attendance/productivity/performance indexes in SQL · **NEW** trend sparkline and delta vs the previous period, CSV/PDF export, employees see only their own score                                                                                                                                                                                         |
| Daily Report      | **EXISTING** live preview → locked snapshot at office end, attendance/review/task/complaint tiles, operational details from the same resolver, corrections listed separately · **NEW** email the locked report, copy as plain text, print stylesheet, weekly and monthly roll-ups                                                                                                                                                            |
| Complaints        | **EXISTING** new → reviewing → resolved tracker, detail with notes and resolution, employee submission · **NEW** anonymous submissions (owner visibility is a setting), severity, assignee, status history, attachments                                                                                                                                                                                                                      |
| Settings          | **EXISTING** office window, late threshold, remote days, approval mode, weekends, break windows, read-only banner for non-owners · **NEW** Leave, Scoring, Departments & designations, Members & roles (transfer ownership), Notifications, Danger zone (export ZIP of CSVs, delete workspace), audit log page                                                                                                                               |
| Public site       | **NEW** landing, features, privacy, terms, contact, changelog; SEO tags + JSON-LD, sitemap, robots, manifest, icons, service worker with offline shell, `security.txt`, `humans.txt`, `/.well-known/change-password`                                                                                                                                                                                                                         |

---

## Roles

| Capability                                            |         Owner         |           Manager           |          Employee           |
| ----------------------------------------------------- | :-------------------: | :-------------------------: | :-------------------------: |
| Dashboard (org-wide)                                  |           ✓           |              ✓              |          own view           |
| Inbox: joins, leave, half-day, attendance, complaints |           ✓           | ✓ (not managers'/own items) |              –              |
| Employees: approve/reject/deactivate, company info    |           ✓           |     ✓ (employees only)      |              –              |
| Promote/demote roles, transfer ownership              |           ✓           |              –              |              –              |
| Check in / out                                        |           ✓           |              ✓              |              ✓              |
| Submit leave / half-day                               |           –           |              –              |              ✓              |
| Review leave                                          |           ✓           |              ✓              |              –              |
| Taskboard                                             | create/assign/archive |    create/assign/archive    | create own, update assigned |
| Meetings                                              |        manage         |           manage            |         view + RSVP         |
| Mark holiday                                          |     ✓ (immediate)     |     ✓ (owner approves)      |              –              |
| Performance ranking                                   |           ✓           |              ✓              |          own score          |
| Daily report                                          |           ✓           |              ✓              |              –              |
| Complaints                                            |        process        |      submit + process       |           submit            |
| Settings                                              |         edit          |          read-only          |           hidden            |
| Audit log                                             |           ✓           |              –              |              –              |

Enforced on the server by `can()` in `src/lib/permissions.ts` (route guards, Astro Actions, query scoping) and by Postgres row-level security per workspace.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    P[Astro pages<br/>SSR HTML] --> I[React islands<br/>TanStack Query]
    I -- Astro Actions (Zod) --> A
    I -- EventSource --> S
    SW[Service worker<br/>offline shell + push]
  end
  subgraph Server["Node (server.mjs: headers, compression, static)"]
    MW[middleware.ts<br/>session · workspace · can() · CSP nonce] --> A[Actions / API routes]
    A --> DS[services & queries]
    S[/api/stream SSE/] --> BUS[LISTEN ledger_events]
    J[node-cron jobs / POST /api/cron/*]
  end
  subgraph Postgres
    T[(tenant tables<br/>RLS on app.workspace_id)]
    R[[SQL resolvers<br/>fn_attendance_summary · fn_performance_index<br/>fn_daily_report · v_inbox_items · v_dashboard_today]]
  end
  DS -- "withWorkspace(): SET LOCAL ROLE ledger_app" --> T
  DS --> R
  DS -- pg_notify --> BUS
  J --> R
  BA[Better Auth<br/>Argon2id · 2FA] --> T
```

- **Single source of truth for metrics**: `src/db/sql/*.sql` defines the resolvers used by the dashboard, performance ranking, daily report and Inbox. They're re-applied idempotently by `pnpm db:migrate` and covered by Vitest tests (weekends, holidays, half-days, time zones, late thresholds, RLS).
- **Request flow**: middleware resolves the session and active workspace, guards routes, and adds a nonce to every script tag. Actions validate input with Zod, check `can()`, and run inside `withWorkspace()` (RLS role + `app.workspace_id`).
- **Real time**: mutations `pg_notify` inside their transaction; one `LISTEN` per server process fans events out over SSE, so islands refresh the matching queries.
- **Scheduled jobs**: lock daily reports at office end (workspace time zone), auto-checkout, morning digest, due-soon reminders, invite-code expiry. Run in-process with `JOBS_ENABLED=true`, or call `POST /api/cron/<job|all>` with `Authorization: Bearer $CRON_SECRET`.

```
src/
  actions/      Astro Actions by domain
  components/   ui/ (primitives) · layout/ · seo/ · features/<domain>/ (islands) · marketing/
  db/           schema/ · sql/ (resolvers, views, RLS) · migrations/ · seed.ts
  i18n/en.ts    UI strings
  layouts/      Base, App, Auth, Marketing
  lib/          auth, permissions, context, dates, notifications, rate-limit, files, jobs, queries/, services/
  middleware.ts
  pages/        marketing · auth/ · app/ · api/
server/         security headers shared by middleware and server.mjs
tests/          unit/ (Vitest + Postgres) · e2e/ (Playwright)
```

---

## Scripts

| Command                                      | What it does                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Dev server on :4321                                                                                     |
| `pnpm build` / `pnpm start`                  | Production build / run `server.mjs`                                                                     |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · `astro check` + `tsc` · Vitest (starts an embedded Postgres unless `TEST_DATABASE_URL` is set) |
| `pnpm check`                                 | All three of the above                                                                                  |
| `pnpm test:e2e`                              | Playwright smoke tests (builds, re-seeds, serves on :4400)                                              |
| `pnpm db:migrate` / `db:migrate:prod`        | Drizzle migrations + SQL resolvers (TS / plain Node)                                                    |
| `pnpm db:seed` · `pnpm db:reset`             | Demo data · drop everything, migrate and seed                                                           |
| `pnpm db:generate`                           | New migration from schema changes                                                                       |
| `pnpm db:local`                              | Docker-free Postgres 16 on :5432                                                                        |
| `pnpm icons`                                 | Regenerate favicons, PWA icons and the OG image from the logo                                           |
| `pnpm screenshots`                           | Re-capture landing-page screenshots from a running dev server                                           |

## Environment variables

See `.env.example` for every variable with comments. The important ones:

| Variable                                       | Purpose                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_SITE_URL`                              | Public origin. Baked into the sitemap, canonical URLs and the trusted host list at **build** time              |
| `DATABASE_URL`                                 | Postgres connection string                                                                                     |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`        | Session signing secret (required in production) and auth base URL                                              |
| `FILE_SIGNING_SECRET`                          | HMAC key for private file links                                                                                |
| `CRON_SECRET`, `JOBS_ENABLED`                  | Protects `/api/cron/*`; runs node-cron in-process                                                              |
| `SMTP_*`, `MAIL_FROM`                          | Email (empty `SMTP_HOST` logs emails to the console; Mailpit: `localhost:1025`; Resend: `smtp.resend.com:465`) |
| `UPSTASH_REDIS_REST_URL/TOKEN`                 | Shared rate limiter for multiple instances (in-memory otherwise)                                               |
| `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push (`pnpm dlx web-push generate-vapid-keys`)                                                             |
| `STORAGE_DIR`, `MAX_UPLOAD_MB`                 | Private upload directory and size limit                                                                        |
| `REQUIRE_EMAIL_VERIFICATION`                   | Block sign-in until email is verified                                                                          |

---

## Deployment

**Docker**

```bash
docker build --build-arg PUBLIC_SITE_URL=https://ledger.example.com -t office-ledger .
docker run -p 4321:4321 --env-file .env -v ledger-data:/data office-ledger
# or: docker compose --profile app up -d
```

The image is multi-stage, runs as a non-root user, keeps uploads in the `/data` volume, and runs `scripts/migrate.mjs` before starting. Its health check probes `/robots.txt`.

**Checklist**

- Serve over HTTPS. HSTS and `upgrade-insecure-requests` turn on automatically when `PUBLIC_SITE_URL` is `https://`.
- Set strong `BETTER_AUTH_SECRET`, `FILE_SIGNING_SECRET` and `CRON_SECRET`.
- Behind a proxy, forward `X-Forwarded-For`/`X-Forwarded-Host`/`X-Forwarded-Proto`. Only hosts matching `PUBLIC_SITE_URL` are trusted.
- With multiple instances: set the Upstash variables, and either keep `JOBS_ENABLED=true` everywhere (jobs are idempotent) or disable it and call `/api/cron/all` every minute from your platform's cron.
- The database role needs `CREATE ROLE` once, so migrations can create `ledger_app` for row-level security.
- Back up Postgres and the `/data` volume.

**Quality gates**: CI runs lint, typecheck, unit/resolver tests, build, `pnpm audit --prod --audit-level high` and the Playwright suite against a Postgres service. Lighthouse (mobile, simulated throttling) on the production build: landing page 98/100/100/100; app pages 93–98 performance and 100 accessibility. App pages score lower on SEO only because they're intentionally `noindex`.

See **DECISIONS.md** for every default and trade-off (including the Astro 5 → 7 upgrade) and **SECURITY.md** for the disclosure policy.
