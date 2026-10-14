# Runbook change: replace v1 completely

This file overrides parts of RUNBOOK.md. Everything not mentioned here stays as written. Put a copy at `docs/hrms/RUNBOOK-replace-v1.md` in your repo.

## What changes

| Old rule | New rule |
|---|---|
| v1 keeps working exactly as today | v1 is being retired. It does not need to keep working after Phase 3. |
| v1 database never changes | v1 database is not used by new code. Old data is **not** imported. |
| v1 smoke check at the end of every phase | Only through Phase 2 (already done). From Phase 3 on, the gate is lint, typecheck, test, build and the new phase's own checks. |
| Only 4 allowed edits in v1 files | You may edit or delete v1 files **when the phase replaces them** (see "Replaces in v1" in each phase). |
| Cleanup after two quiet weeks | Cleanup happens in a new Phase 16, right after cutover is verified. |
| Routes live under `/api` and `/hrms` | Keep `/api` and `/hrms` while building. At Phase 16 they become the main routes (see below). |

## What stays the same (the safety net)

- Branch `hrms-v2` and tag `pre-hrms` exist. Whole v1 is one `git checkout pre-hrms` away.
- The v1 `pg_dump` outside the repo stays until you decide to delete it. Nothing is dropped from the old database by Claude Code.
- Never run `hrms_rule_tests.sql` on a real database. Never edit `hrms_schema.sql` or `0002_auth_sessions.sql`.
- Never print secrets. No commits or pushes unless you ask.

## Phases 3 to 15

Do them in order as written, with these differences:
- When a phase says "Replaces in v1", delete those v1 routes, service code, specs and screens **at the end of that phase**, once the new ones pass their gate. Do not delete anything a later phase still needs.
- Skip every "v1 smoke unchanged" line in the gates.
- Phase 3: v1 login is removed at the end of the phase. Seeded demo users are the new ones.
- Phase 15 (Cutover) loses its "leave v1 running for two weeks" step.

## New Phase 16: Make v2 the only app

1. Delete what is left of v1 (backend modules, old drizzle migrations 0000 to 0004, old DB config, old frontend routes, `scripts/v1-smoke.*`). Complaints and messages code goes too (not in plan v3).
2. Remove the three guard edits that skip `/api`, and the `HRMS_V2_ENABLED`, `NEXT_PUBLIC_HRMS_ENABLED` and `NEXT_PUBLIC_HRMS_DEFAULT` flags. The new code is always on.
3. Move routes: `/api/*` becomes `/api/*`, frontend `/hrms/*` becomes `/*`. Update the proxy, cookies names may stay `hrms_access` and `hrms_refresh`.
4. Point `DATABASE_URL` at `office_ledger_hrms`. Remove the old URL from `.env.example`.
5. Update `CLAUDE.md`, `docs/production.md`, `.env.example`.
6. Gate: lint, typecheck, test, build; a full sign-in, create project, create task, request and approve walk-through works on the new routes; `grep -r "api\|HRMS_V2_ENABLED\|hrms_" ` shows no leftover flags.
7. Rollback: `git checkout pre-hrms` and restore the old database from the dump.

## Prompt for Phase 16 (paste into Claude Code)

> Read docs/hrms/RUNBOOK-replace-v1.md, Phase 16. Do Phase 16 only. First list every v1 file you plan to delete and every route you plan to rename, and wait for my "go". Then do it, run lint, typecheck, test and build, and report the gate results. Do not touch the old database. Do not commit.

## Prompt to give Claude Code now (before Phase 3)

> Read docs/hrms/RUNBOOK-replace-v1.md. From now on we are replacing v1 completely, not running it beside the new code. Follow that file where it differs from RUNBOOK.md. Phase 2 stays as you built it. Do not start Phase 3 yet. Reply with one line confirming you understood.
