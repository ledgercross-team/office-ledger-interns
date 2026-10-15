# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

office-ledger is a multi-organisation HRMS: projects, tasks, requests and approvals, attendance, leave, calendar, ratings and performance, with five roles (gameMaster, CEO, COO, manager, employee). One login can belong to several organisations. pnpm workspace with two packages: `backend/` (NestJS 12, Drizzle ORM, PostgreSQL; port 4000) and `frontend/` (Next.js 16, React 19, TanStack Query, Tailwind 4; port 3000). Node version in `.nvmrc`. No Docker.

## Commands

Run from the repo root:

```bash
pnpm install
pnpm dev:backend              # needs PostgreSQL running
pnpm dev:frontend
pnpm lint                     # backend: oxlint --type-aware; frontend: eslint
pnpm typecheck
pnpm test                     # backend jest
pnpm db:migrate               # applies docs/hrms/*.sql in order, once each (owner login)
pnpm db:seed                  # dev-only, idempotent; uses SEED_DEMO_PASSWORD
pnpm db:create-game-master    # the first gameMaster of a new database (owner login)
```

Single backend test: `pnpm --filter backend test -- path/to/file.spec.ts` (add `-t "name"` for one case). Jest runs with `--experimental-vm-modules`, so always go through the package script. Integration specs (`*.integration.spec.ts`) need a THROWAWAY database: set `HRMS_TEST_APP_URL` (the `hrms_api` login) and `HRMS_TEST_OWNER_URL`; without them they skip. Frontend unit tests: `pnpm --filter frontend exec vitest run`.

Env files: copy `backend/.env.example` to `backend/.env.local` and `frontend/.env.example` to `frontend/.env.local`.

## Architecture

### Database
- One PostgreSQL database, schema `hrms`, defined by `docs/hrms/hrms_schema.sql` plus numbered files (`0002_`, `0003_`, ...). Applied files are immutable: add a new numbered file, never edit one. Never run `hrms_rule_tests.sql` anywhere but a throwaway database (`backend/scripts/hrms-rule-tests.sh` refuses others).
- The rules live in the database (triggers, row-level security, views, `gm_*` and `job_*` functions). The API does not repeat them; it maps database errors to HTTP (`hrms-error.filter.ts`).
- The API connects as the `hrms_api` role (`DATABASE_URL`), never the owner. Every request runs in one transaction that first sets `app.org_id`, `app.member_id`, `app.user_id` and `app.client_ip` (`hrms/db/hrms-context*.ts`).

### Backend (`backend/src`)
- `app.module.ts`: config validation, the in-memory throttler, the origin check, and `HrmsModule`. All routes are under `/api` (each controller declares `api/...` through `@HrmsController`).
- `hrms/` holds every feature: `auth/` (JWT cookies `hrms_access`/`hrms_refresh`, refresh rotation, MFA, deny-by-default guard with `@Public`, `@HrmsSession`, `@HrmsRoles`), `org/`, `members/`, `projects/`, `tasks/`, `requests/` (one inbox, apply step per type), `attendance/`, `leave/`, `calendar/`, `ratings/`, `notifications/`, `jobs/` (scheduler with advisory lock; `HRMS_JOBS_ENABLED=false` turns it off), `audit/`, `platform/` (gameMaster console), `mail/`.
- Services are thin: SQL through drizzle's `sql` with `current_org_id()`; role scoping per route is documented next to the route.
- The throttler stores counters in API process memory. Only credential endpoints use the strict `auth` policy (`STRICT_AUTH_PATHS` in `app.module.ts`).
- Env is validated in `config/env.validation.ts`. `MFA_ENCRYPTION_KEY` is required.

### Frontend (`frontend/src`)
- App Router. Authenticated screens are in `app/(app)/` (shell, `/projects`, `/tasks`, ...); `login`, `accept-invite`, `forgot-password` and `change-password` sit beside it. `proxy.ts` redirects on cookie presence only; real authorization is the API's.
- `lib/hrms/api-client.ts` is the single fetch wrapper (typed `HrmsApiError`, refresh on 401). `lib/hrms/auth-context.tsx` holds the session; `components/hrms/role-gate.tsx` gates UI by role; `components/ui/` is the design system.
- `frontend/AGENTS.md`: this Next.js version has breaking changes; read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.

## Conventions
- Branches: `feat/<issue>-short-name`, `fix/…`, `chore/…`, `docs/…`; one issue per branch/PR; PR body says `Closes #N`.
- Conventional Commits for commits and PR titles, e.g. `feat(db): add users schema`.
- Production build/deploy and the go-live checklist: `docs/production.md` and `docs/hrms/CUTOVER.md`.
