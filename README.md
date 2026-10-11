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

## Conventions

- Branches: `feat/<issue-number>-short-name`, `fix/…`, `chore/…`, `docs/…`.
- Commits and PR titles use Conventional Commits, e.g. `feat(db): add users schema`.
- One issue per branch and PR; the PR body says `Closes #N`.
