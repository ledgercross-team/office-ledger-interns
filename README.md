# office-ledger

A multi-organisation HRMS: projects, tasks, requests and approvals, attendance, leave, calendar,
ratings and performance, with five roles (gameMaster, CEO, COO, manager, employee). Next.js
frontend, NestJS backend, and PostgreSQL (rules enforced in the database).
Built with pnpm, no Docker.

The plan is `docs/hrms/plan-v3.md`; the database is `docs/hrms/hrms_schema.sql`.

## Layout

- `backend/` NestJS API (port 4000)
- `frontend/` Next.js app (port 3000)

## Getting started

```bash
nvm use                       # Node 24, see .nvmrc
pnpm install
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local
pnpm dev:backend              # terminal 1
pnpm dev:frontend             # terminal 2
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Database setup

Create the database and the login the API uses (see `docs/hrms/README.md`), then configure
`backend/.env.local` from `backend/.env.example`:

```bash
createdb office_ledger_hrms
pnpm db:migrate               # owner login: HRMS_MIGRATE_DATABASE_URL
pnpm db:seed                  # development only; uses SEED_DEMO_PASSWORD
```

The API itself connects as `hrms_api` (`DATABASE_URL`), never as the owner. Applied SQL files
are immutable: changes after launch are new numbered files in `docs/hrms/`, applied by
`pnpm db:migrate`. Never run `docs/hrms/hrms_rule_tests.sql` on a real database.

For integration tests create a throwaway database (name ending `_throwaway`), load the SQL
files, and set `HRMS_TEST_APP_URL` and `HRMS_TEST_OWNER_URL`.

## Hardening and rate limits

Rate-limit counters are kept in the API process memory, so the API does not require an external cache.
Counters reset when the process restarts and are not shared between multiple API replicas. For
multi-replica deployments, put rate limiting at the reverse proxy or add a shared store later.
The default policy is `RATE_LIMIT_GLOBAL_PER_MIN` requests per minute; the stricter `auth`
policy covers credential routes (login, refresh, switch-org, MFA, change-password, accept-invite).

The HTTP bootstrap also enables Helmet, an explicit credentialed CORS allowlist from
`FRONTEND_URL`, bounded JSON/form bodies, strict validation-pipe behavior, cookie parsing, and
configurable proxy trust. `TRUST_PROXY=true` trusts exactly one proxy hop; set it only when the
API sits behind a reverse proxy you control.

## Production

See [docs/production.md](docs/production.md) for build and start commands, required
environment, migrations on deploy, creating the first gameMaster, and the pre-launch
security checklist.

## Conventions

- Branches: `feat/<issue-number>-short-name`, `fix/…`, `chore/…`, `docs/…`.
- Commits and PR titles use Conventional Commits, e.g. `feat(db): add users schema`.
- One issue per branch and PR; the PR body says `Closes #N`.
