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
