# Production guide

One document to deploy office-ledger safely. Work through it top to bottom, then the
[pre-launch checklist](#pre-launch-checklist). The go-live walkthrough and rollback are in
[`docs/hrms/CUTOVER.md`](hrms/CUTOVER.md).

## What runs where

| Part | Command | Default port |
| --- | --- | --- |
| Backend API (NestJS) | `pnpm --filter backend start:prod` | 4000 |
| Frontend (Next.js) | `pnpm --filter frontend start` | 3000 |
| PostgreSQL 15 or newer | managed or self-hosted | 5432 |

Put both apps behind an HTTPS reverse proxy. The project itself ships no container setup.

## 1. Prerequisites

- Node from `.nvmrc` (24) and pnpm (`corepack enable`; the version is pinned in `package.json`).
- A PostgreSQL database `office_ledger_hrms`, its owner login, and the app login `hrms_api`
  (created as in `docs/hrms/README.md`). The API must connect as `hrms_api`, never the owner.
- Two hostnames under one parent domain, for example `app.example.com` (frontend) and
  `api.example.com` (backend). Cookies are shared through `COOKIE_DOMAIN`.

## 2. Environment

### Backend (`backend/.env.local`, or real environment variables, which win)

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | port the API listens on |
| `DATABASE_URL` | `postgres://hrms_api:<secret>@host:5432/office_ledger_hrms` (the app role) |
| `FRONTEND_URL` | the exact frontend origin, e.g. `https://app.example.com` (no trailing slash, never `*`) |
| `JWT_ACCESS_SECRET` | unique, random, 32+ characters (see below) |
| `JWT_ACCESS_TTL_SECONDS` | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | `7` |
| `COOKIE_SECURE` | `true` (the API refuses to start in production otherwise) |
| `COOKIE_DOMAIN` | the parent domain with a leading dot, e.g. `.example.com` |
| `TRUST_PROXY` | `true` when the API sits behind exactly one reverse proxy, otherwise `false` |
| `MFA_ENCRYPTION_KEY` | 32 random bytes as 64 hex characters (`openssl rand -hex 32`). Losing it locks out every gameMaster, CEO and COO, so back it up with the other secrets. |
| `HRMS_JOBS_ENABLED` | `true` (default). `false` stops expiry, reminders, auto check-out, scores and email. |
| `MAIL_TRANSPORT` | `log` or `none`. **No real email transport exists yet**; in production `log` writes the recipient and subject only, so invite and recovery links are not delivered until one is added. |
| `RATE_LIMIT_GLOBAL_PER_MIN` | `100` |
| `RATE_LIMIT_GLOBAL_BLOCK_SECONDS` | `60` |
| `RATE_LIMIT_AUTH_PER_MIN` | `10` |
| `RATE_LIMIT_AUTH_BLOCK_SECONDS` | `300` |
| `HRMS_MIGRATE_DATABASE_URL` | Owner login. Set only where you run the migrate, seed and create-game-master commands, never on the API host. |

`SEED_DEMO_PASSWORD` is only used by the development seed. Do not set it in production.

Generate a secret per environment and never reuse the one in `backend/.env.example`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Frontend

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com/api` |

This value is compiled into the bundle, so it must be set **when you build**, not only
when you start.

## 3. Build and start

```bash
pnpm install --frozen-lockfile
pnpm --filter backend build
NEXT_PUBLIC_API_URL=https://api.example.com/api pnpm --filter frontend build
```

Do not build with `NODE_ENV=development` exported in your shell; `next build` fails with a
`useState` error. Leave `NODE_ENV` unset for the build.

```bash
# backend (reads backend/.env.local or the process environment)
NODE_ENV=production pnpm --filter backend start:prod

# frontend
NODE_ENV=production pnpm --filter frontend start
```

Run both under a process manager (systemd, pm2, ...) so they restart on failure. Check the
API with `GET /api/health`: `200` means PostgreSQL answered, and `503` means it did not.

## 4. Database changes on deploy

Run before starting the new backend, from the checkout you are deploying, as the owner:

```bash
HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms pnpm db:migrate
```

- It applies `docs/hrms/hrms_schema.sql`, then the numbered files in order, each once,
  recorded in `public.hrms_migration_log` with a checksum.
- It stops if an applied file changed on disk. Never edit an applied file; add a new
  numbered one.
- Take a `pg_dump` first when the release contains a new file (see [Backups](#backups)).
- Prefer changes that are compatible with the previous release, so a rollback of the app
  does not need a database rollback.
- Never run `docs/hrms/hrms_rule_tests.sql` on this database. It adds sample data and
  changes plan limits.

## 5. First login: create the gameMaster

The seed refuses to run when `NODE_ENV=production`. A fresh database has no users, so create
the first gameMaster once, as the owner:

```bash
GAME_MASTER_EMAIL=owner@example.com \
GAME_MASTER_PASSWORD='a-long-one-time-password' \
GAME_MASTER_NAME='Site Owner' \
HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms \
pnpm db:create-game-master
```

- The password must be 10 to 128 characters and must not equal the email.
- The script refuses an email that already exists and changes nothing in that case.
- Clear the password from your shell history afterwards.
- The first sign-in forces enrolment of an authenticator app.

Then sign in as the gameMaster and create organisations from the console. Each organisation's
CEO receives a one-time link to set their own password.

## 6. Reverse proxy, HTTPS and cookies

- Serve both hostnames over HTTPS only and redirect HTTP to HTTPS.
- Forward the client IP (`X-Forwarded-For`) and set `TRUST_PROXY=true`. Rate limits, the login
  throttle and the office-network check at check-in use the client IP; with the wrong setting
  everyone shares one IP, or the IP can be spoofed.
- Auth cookies (`hrms_access`, `hrms_refresh`) are `HttpOnly`, `SameSite=Lax` and, with
  `COOKIE_SECURE=true`, `Secure`. `COOKIE_DOMAIN=.example.com` lets the frontend host see
  the cookies set by the API host.
- Cross-site state-changing requests are rejected unless their `Origin` equals
  `FRONTEND_URL`, so it must match what the browser sends exactly (scheme, host, port).

## Backups

Daily logical backup, kept for at least 14 days, stored off the database host:

```bash
pg_dump --format=custom --file="office_ledger_hrms_$(date +%F).dump" "$HRMS_MIGRATE_DATABASE_URL"
```

**Test the restore** before launch and after any major change, into a scratch database:

```bash
createdb office_ledger_restore_test
pg_restore --no-owner --dbname=office_ledger_restore_test office_ledger_hrms_YYYY-MM-DD.dump
psql office_ledger_restore_test -c "select count(*) from hrms.users;"
dropdb office_ledger_restore_test
```

A backup that has never been restored is not a backup.

## Run a production build locally

Use a throwaway database. This is also how to confirm the guide works:

```bash
export NODE_ENV=production PORT=4100 \
  DATABASE_URL=postgres://hrms_api:pass@localhost:5432/office_ledger_prodtest \
  FRONTEND_URL=http://localhost:3000 \
  JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  MFA_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  COOKIE_SECURE=true TRUST_PROXY=false

pnpm db:seed                 # must refuse: it is development only
pnpm --filter backend build && pnpm --filter backend start:prod
curl -s localhost:4100/api/health     # {"status":"ok"}
```

With `COOKIE_SECURE=false` the API must refuse to start. Browsers only keep `Secure` cookies
over HTTPS, so test logins locally with `curl`, or put a local HTTPS proxy in front.

## Pre-launch checklist

Copy this into the release PR or ticket and tick every line.

**Configuration**

- [ ] `NODE_ENV=production` for both apps.
- [ ] `COOKIE_SECURE=true`.
- [ ] `COOKIE_DOMAIN` is set to the shared parent domain (leading dot).
- [ ] `TRUST_PROXY` matches the real proxy setup (`true` for one proxy, `false` for none).
  After deploying, sign in from outside the office with office IP addresses set: check-in must be
  refused. The API logs which value it started with.
- [ ] No `@demo.local` accounts exist (`pnpm db:seed` refuses to run when `NODE_ENV=production` or
  against a non-local host, but check the database anyway).
- [ ] `FRONTEND_URL` is the exact production origin and is not `*`.
- [ ] `NEXT_PUBLIC_API_URL` was set at frontend build time.
- [ ] `SEED_DEMO_PASSWORD` is not set.
- [ ] `DATABASE_URL` is the `hrms_api` login, not the owner.

**Secrets and network**

- [ ] `JWT_ACCESS_SECRET` is unique to production, random and at least 32 characters.
- [ ] `MFA_ENCRYPTION_KEY` is set and backed up separately.
- [ ] Database password is unique and strong.
- [ ] PostgreSQL is not reachable from the public internet.
- [ ] HTTPS only: HTTP redirects to HTTPS and certificates renew automatically.
- [ ] No `.env*` file other than `.env.example` is committed.

**Dependencies**

- [ ] `pnpm audit --prod` reports no high or critical issues. Advisories that only affect
  development tooling (linters, test runners) are tracked but do not block a release.

**Data**

- [ ] `pnpm db:migrate` has run against the production database.
- [ ] The first gameMaster exists and has enrolled an authenticator.
- [ ] A real email transport is in place (otherwise invites are not delivered).
- [ ] Daily `pg_dump` is scheduled and the restore was tested end to end.

**Smoke test after deploy**

- [ ] `GET /api/health` returns 200.
- [ ] Sign in as the gameMaster over HTTPS and create a test organisation.
- [ ] The CEO sets a password from the link, signs in with a code, adds a member, creates a
  project and a task.
- [ ] A foreign `Origin` on a POST is rejected (403).
- [ ] Block the test organisation in the console and confirm its people are refused.
