# office-ledger

A multi-company HRMS: attendance, task management and subscriptions for companies, with four
roles (game master, admin, manager, employee). Next.js frontend, NestJS backend with Passport
JWT, Drizzle and PostgreSQL, Redis for caching and rate limits. Built with pnpm, no Docker.

The build plan (v2.0) is the source of truth; work is tracked in GitHub issues and milestones.

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

Create the local PostgreSQL role and databases, then configure `backend/.env.local` from
`backend/.env.example`:

```bash
psql -U postgres -c "CREATE ROLE office_ledger_app WITH LOGIN PASSWORD 'change_me_locally';"
psql -U postgres -c "CREATE DATABASE office_ledger_dev OWNER office_ledger_app;"
psql -U postgres -c "CREATE DATABASE office_ledger_e2e OWNER office_ledger_app;"

pnpm db:migrate
pnpm db:seed
```

The seed command is development-only, refuses to run in production, and uses
`SEED_DEMO_PASSWORD` for all demo accounts without printing the password.

After pulling changes that add a migration, stop the backend, run `pnpm db:migrate`, and then
restart it. Applied migration files are immutable: add a new numbered migration instead of
replacing or editing one that may already exist in another developer's database.

### Database release gate

Run the migration and seed twice against `office_ledger_dev`; the second seed must also
succeed with the same row counts:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed
```

Verify the database-level safety rules before releasing:

```sql
-- A manager cannot be assigned to an employee from another company.
UPDATE users AS e SET manager_id = m.id
FROM users AS m
WHERE e.email = 'employee1@globex.local' AND m.email = 'manager1@acme.local';

-- A task cannot link users from different companies.
INSERT INTO tasks (company_id, title, deadline, assignee_id, created_by_id)
SELECT a.company_id, 'cross-company safety check', now(), g.id, a.id
FROM users AS a
JOIN users AS g ON g.email = 'employee1@globex.local'
WHERE a.email = 'admin@acme.local';
```

Both statements must be rejected by PostgreSQL. Do not run them in an application transaction
that is expected to commit; use a disposable transaction or roll back after each check.

The release tag is `v0.1.0-db`. Protect `main` with required pull requests, one approval, and
squash merges before this tag is published. Required CI checks are added with the later CI issue.

## Redis, hardening and rate limits

Redis is required by the API for distributed throttling. Start Redis locally, then set
`REDIS_URL` in `backend/.env.local`:

```bash
redis-server
```

The API connects with bounded command timeouts, disables the offline command queue, retries
briefly, and fails startup if Redis cannot be reached. Rate-limit counters use an atomic Redis
Lua script so concurrent API instances share the same fixed-window counters. The default policy
is `RATE_LIMIT_GLOBAL_PER_MIN` requests per minute; the reserved `auth` policy is stricter and is
ready for login routes. Current non-auth routes explicitly skip that reserved policy.

`@nest-lab/throttler-storage-redis@1.2.0` is not used because its Nest peer range stops at
Nest 11. The project uses a small local adapter against the Nest 12 `ThrottlerStorage`
interface and the existing `ioredis` dependency instead.

The HTTP bootstrap also enables Helmet, an explicit credentialed CORS allowlist from
`FRONTEND_URL`, bounded JSON/form bodies, strict validation-pipe behavior, cookie parsing, and
configurable proxy trust. `TRUST_PROXY=true` trusts exactly one proxy hop; set it only when the
API sits behind a reverse proxy you control.

## Production

See [docs/production.md](docs/production.md) for build and start commands, required
environment, migrations on deploy, creating the first game master, and the pre-launch
security checklist.

## Conventions

- Branches: `feat/<issue-number>-short-name`, `fix/…`, `chore/…`, `docs/…`.
- Commits and PR titles use Conventional Commits, e.g. `feat(db): add users schema`.
- One issue per branch and PR; the PR body says `Closes #N`.
