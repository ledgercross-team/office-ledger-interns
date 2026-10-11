# Production guide

One document to deploy office-ledger safely. Work through it top to bottom, then the
[pre-launch checklist](#pre-launch-checklist).

## What runs where

| Part | Command | Default port |
| --- | --- | --- |
| Backend API (NestJS) | `pnpm --filter backend start:prod` | 4000 |
| Frontend (Next.js) | `pnpm --filter frontend start` | 3000 |
| PostgreSQL 16 | managed or self-hosted | 5432 |
| Redis 7 | private network only | 6379 |

Put both apps behind an HTTPS reverse proxy. The project itself ships no container setup.

## 1. Prerequisites

- Node from `.nvmrc` (24) and pnpm (`corepack enable`; the version is pinned in `package.json`).
- A PostgreSQL database and role for the app, and a Redis instance reachable only from the API.
- Two hostnames under one parent domain, for example `app.example.com` (frontend) and
  `api.example.com` (backend). Cookies are shared through `COOKIE_DOMAIN`.

## 2. Environment

### Backend (`backend/.env.local`, or real environment variables, which win)

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | port the API listens on |
| `DATABASE_URL` | `postgres://user:password@host:5432/office_ledger` |
| `REDIS_URL` | `redis://:password@host:6379/0` |
| `FRONTEND_URL` | the exact frontend origin, e.g. `https://app.example.com` (no trailing slash, never `*`) |
| `JWT_ACCESS_SECRET` | unique, random, 32+ characters (see below) |
| `JWT_ACCESS_TTL_SECONDS` | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | `7` |
| `COOKIE_SECURE` | `true` (the API refuses to start in production otherwise) |
| `COOKIE_DOMAIN` | the parent domain with a leading dot, e.g. `.example.com` |
| `TRUST_PROXY` | `true` when the API sits behind exactly one reverse proxy, otherwise `false` |
| `RATE_LIMIT_GLOBAL_PER_MIN` | `100` |
| `RATE_LIMIT_GLOBAL_BLOCK_SECONDS` | `60` |
| `RATE_LIMIT_AUTH_PER_MIN` | `10` |
| `RATE_LIMIT_AUTH_BLOCK_SECONDS` | `300` |

`SEED_DEMO_PASSWORD` is only used by the development seed. Do not set it in production.

Generate a secret per environment and never reuse the one in `backend/.env.example`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Frontend

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com/api/v1` |

This value is compiled into the bundle, so it must be set **when you build**, not only
when you start.

## 3. Build and start

Install and build from a checkout with all dependencies (the migration and
game-master scripts need `drizzle-kit` and `tsx`, which are dev dependencies).

```bash
pnpm install --frozen-lockfile
pnpm --filter backend build
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 pnpm --filter frontend build
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
API with `GET /api/v1/health`: `200` means Postgres and Redis both answered, `503` means one
did not.

## 4. Migrations on deploy

Run migrations **before** starting the new backend, from the checkout you are deploying:

```bash
pnpm db:migrate
```

- It applies the committed SQL in `backend/drizzle/` and is safe to run again.
- Never run `drizzle-kit push` against a shared or production database.
- Never edit a migration that has already been released; add a new one.
- Take a `pg_dump` first when the release contains a migration (see [Backups](#backups)).
- Prefer migrations that are compatible with the previous release, so a rollback of the app
  does not need a database rollback.

## 5. First login: create the game master

The seed refuses to run when `NODE_ENV=production`. A fresh production database has no
users, so create the first game master once:

```bash
GAME_MASTER_EMAIL=owner@example.com \
GAME_MASTER_PASSWORD='a-long-one-time-password' \
GAME_MASTER_NAME='Site Owner' \
NODE_ENV=production pnpm db:create-game-master
```

- The password must be 10 to 128 characters and must not equal the email.
- The account is flagged to change its password at first login, so the value you typed here
  is only good once.
- The script refuses to run if the email already exists and changes nothing in that case.
- Clear the password from your shell history afterwards.

Then log in as the game master and create companies from the UI. Each company gets its admin
and a one-time temporary password.

## 6. Reverse proxy, HTTPS and cookies

- Serve both hostnames over HTTPS only and redirect HTTP to HTTPS.
- Forward the client IP (`X-Forwarded-For`) and set `TRUST_PROXY=true`. Rate limits and the
  login throttle use the client IP; with the wrong setting everyone shares one IP, or the IP
  can be spoofed.
- Auth cookies are `HttpOnly`, `SameSite=Lax` and, with `COOKIE_SECURE=true`, `Secure`.
  `COOKIE_DOMAIN=.example.com` lets the frontend host see the cookies set by the API host.
- Cross-site state-changing requests are rejected unless their `Origin` equals
  `FRONTEND_URL`, so it must match what the browser sends exactly (scheme, host, port).

## Backups

Daily logical backup, kept for at least 14 days, stored off the database host:

```bash
pg_dump --format=custom --file="office_ledger_$(date +%F).dump" "$DATABASE_URL"
```

Redis holds only caches and rate-limit counters. Flushing it is always safe, so it needs no
backup.

**Test the restore** before launch and after any major change, into a scratch database:

```bash
createdb office_ledger_restore_test
pg_restore --no-owner --dbname=office_ledger_restore_test office_ledger_YYYY-MM-DD.dump
psql office_ledger_restore_test -c "select count(*) from users;"
dropdb office_ledger_restore_test
```

A backup that has never been restored is not a backup.

## Run a production build locally

Use a throwaway database. This is also how to confirm the guide works:

```bash
export NODE_ENV=production PORT=4100 \
  DATABASE_URL=postgres://user:pass@localhost:5432/office_ledger_prodtest \
  REDIS_URL=redis://localhost:6379/1 FRONTEND_URL=http://localhost:3000 \
  JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  COOKIE_SECURE=true TRUST_PROXY=false

pnpm db:migrate
pnpm db:seed                 # must print "Refusing to seed a production database."
pnpm --filter backend build && pnpm --filter backend start:prod
curl -s localhost:4100/api/v1/health     # {"status":"ok"}
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
- [ ] `FRONTEND_URL` is the exact production origin and is not `*`.
- [ ] `NEXT_PUBLIC_API_URL` was set at frontend build time.
- [ ] `SEED_DEMO_PASSWORD` is not set.

**Secrets and network**

- [ ] `JWT_ACCESS_SECRET` is unique to production, random and at least 32 characters.
- [ ] Database and Redis passwords are unique and strong.
- [ ] Redis is not reachable from the public internet (private network or firewall).
- [ ] PostgreSQL is not reachable from the public internet.
- [ ] HTTPS only: HTTP redirects to HTTPS and certificates renew automatically.
- [ ] No `.env*` file other than `.env.example` is committed.

**Dependencies**

- [ ] `pnpm audit --prod` reports no high or critical issues. Advisories that only affect
  development tooling (linters, test runners) are tracked but do not block a release.

**Data**

- [ ] `pnpm db:migrate` has run against the production database.
- [ ] The first game master exists, and its one-time password has been changed.
- [ ] Daily `pg_dump` is scheduled and the restore was tested end to end.

**Smoke test after deploy**

- [ ] `GET /api/v1/health` returns 200.
- [ ] Log in as the game master over HTTPS and create a test company.
- [ ] A foreign `Origin` on a POST is rejected (403).
- [ ] Deactivate the test company and confirm its users are signed out.
