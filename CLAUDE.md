# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

office-ledger is a multi-company HRMS (attendance, tasks, subscriptions, messages) with four roles: game master, admin, manager, employee. pnpm workspace with two packages: `backend/` (NestJS 12, Passport JWT, Drizzle ORM, PostgreSQL, Redis; port 4000) and `frontend/` (Next.js 16, React 19, TanStack Query, Tailwind 4; port 3000). Node version in `.nvmrc`. No Docker.

## Commands

Run from the repo root:

```bash
pnpm install
pnpm dev:backend              # needs PostgreSQL and Redis running; API fails startup without Redis
pnpm dev:frontend
pnpm lint                     # backend: oxlint --type-aware; frontend: eslint
pnpm typecheck
pnpm test                     # backend jest unit tests only
pnpm db:generate              # create a drizzle migration from schema changes
pnpm db:migrate
pnpm db:seed                  # dev-only, idempotent; uses SEED_DEMO_PASSWORD
pnpm db:create-game-master
```

Single backend test: `pnpm --filter backend test -- path/to/file.spec.ts` (add `-t "name"` for one case). Jest runs with `--experimental-vm-modules`, so always go through the package script. E2E: `pnpm --filter backend test:e2e`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, backend tests, then builds both packages. Env files: copy `backend/.env.example` to `backend/.env.local` and `frontend/.env.example` to `frontend/.env.local`.

## Architecture

### Backend (`backend/src`)
- `app.module.ts` wires global guards in order: throttler, JWT auth, account state, roles. Routes are authenticated by default; use `@Public()`. Role restriction is via `@Roles()`. Decorators/guards live in `auth/`.
- Feature code is in `modules/<feature>/` (controller, service, `dto/`, pure helper files with `.spec.ts`). Business rules are kept in small pure files (`task-rules.ts`, `subscription-utils.ts`, `users/visibility.ts`) so they can be unit tested without a DB.
- `users/visibility.ts` defines who can manage whom (admin -> managers+employees, manager -> only their assigned employees). Reuse `managedPeople` / `manageableRoles` in queries rather than re-deriving role scoping.
- Multi-tenancy: data is scoped by `company_id`; DB-level constraints reject cross-company manager/task links. Company-local time handling is in `common/utils/company-time.ts` and `dates.ts`.
- Schema is in `db/schema/*` with migrations in `backend/drizzle/`. Applied migrations are immutable: add a new numbered migration, never edit an existing one.
- Redis (`modules/redis`) backs a custom `ThrottlerStorage` adapter (Lua fixed-window counters). Only credential endpoints use the strict `auth` throttle policy (`STRICT_AUTH_PATHS` in `app.module.ts`).
- `test-support/fake-db.ts` is the fake DB used by unit tests.
- API prefix is `/api/v1`. Env is validated in `config/env.validation.ts`.

### Frontend (`frontend/src`)
- App Router. `app/(app)/` holds authenticated pages (including `game-master/*`); `login` and `change-password` are outside the group.
- `proxy.ts` (Next 16's replacement for middleware) redirects based on presence of `access_token`/`refresh_token` cookies only; real authorization is enforced by the API.
- `lib/api-client.ts` is the single fetch wrapper (typed `ApiError`, automatic refresh on 401). `lib/auth-context.tsx` holds the session; `components/role-gate.tsx` gates UI by role; `lib/navigation.ts` defines role-based nav; `lib/types.ts` mirrors API shapes.
- `frontend/AGENTS.md`: this Next.js version has breaking changes; read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.

## Conventions
- Branches: `feat/<issue>-short-name`, `fix/…`, `chore/…`, `docs/…`; one issue per branch/PR; PR body says `Closes #N`.
- Conventional Commits for commits and PR titles, e.g. `feat(db): add users schema`.
- Production build/deploy and the pre-launch checklist: `docs/production.md`.
