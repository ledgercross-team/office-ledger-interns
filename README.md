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
-- A second admin for one company must fail with users_one_admin_per_company.
INSERT INTO users (company_id, role, email, password_hash, full_name)
SELECT company_id, 'admin', 'duplicate-admin@acme.local', 'test-only', 'Duplicate Admin'
FROM users WHERE email = 'admin@acme.local';

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

## Conventions

- Branches: `feat/<issue-number>-short-name`, `fix/…`, `chore/…`, `docs/…`.
- Commits and PR titles use Conventional Commits, e.g. `feat(db): add users schema`.
- One issue per branch and PR; the PR body says `Closes #N`.
