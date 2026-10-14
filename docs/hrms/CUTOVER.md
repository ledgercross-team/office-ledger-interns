# Cutover: making HRMS v2 the default

Phase 15 of `RUNBOOK.md`. Nothing is deleted here. v1 keeps running untouched and its database
is never changed, so going back needs no database work. Cleanup is Phase 16, asked for
separately.

## 1. Before anything: what must be true

| Check | How |
|---|---|
| All phase gates are green | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter backend build && pnpm --filter frontend build` |
| Integration tests run against a throwaway database | `HRMS_TEST_APP_URL` (hrms_api login) and `HRMS_TEST_OWNER_URL` set, then `pnpm test`. Suites skip silently without them, so check the count. |
| Rule tests are green on a throwaway database | `backend/scripts/hrms-rule-tests.sh` (it refuses any database name that does not end in `_throwaway` or `_test`). **Never on the real database.** |
| Security review has no open finding that blocks launch | `docs/hrms/SECURITY_REVIEW.md`. F4 and F5 are accepted risks; F3 is closed. |
| Both databases are backed up | See section 3. |
| A real email transport exists | **Open blocker.** Only `MAIL_TRANSPORT=log` exists. In production the log carries the recipient and subject, not the body, so invite and recovery links are not delivered. Add SMTP or a provider (a dependency decision) before any customer is invited. |

## 2. Staging run, in order

1. Create the database and the login role as in `docs/hrms/README.md` (`hrms_api`, never the owner).
2. `HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms pnpm --filter backend db:migrate:hrms`
   Applies `hrms_schema.sql`, then `0002`, `0003`, `0004`, each once, with a checksum guard.
3. Create the first gameMaster (owner login, run once):
   ```bash
   GAME_MASTER_EMAIL=owner@example.com GAME_MASTER_PASSWORD='a-long-one-time-password' \
   GAME_MASTER_NAME='Site Owner' HRMS_MIGRATE_DATABASE_URL=postgres://<owner>@host/office_ledger_hrms \
   pnpm --filter backend db:create-game-master:hrms
   ```
   Clear the password from shell history. The first sign-in forces authenticator enrolment.
4. Start the API with the variables in section 4 and the frontend built with its flags.
5. Walk through, as people, not as scripts:
   - gameMaster signs in (enrols), creates an organisation with a CEO's email.
   - The CEO opens the emailed link, sets a password, signs in (enrols).
   - The CEO adds a manager and an employee, creates a project and a task.
   - The employee checks in from an office network (add one in settings) and is refused from another.
   - A request is filed, decided, and applied; a notification arrives; the bell shows it.
   - Switch the org flag off and on again (section 5) and confirm the other side still works.
6. Confirm the scheduler: `job_runs` has a row per job within ten minutes, and a second API
   instance does not change the run counts.

The same walk is covered by `backend/src/hrms/cutover.integration.spec.ts`.

## 3. Backups before the switch

```bash
pg_dump --format=custom --file=office_ledger_v1_$(date +%F).dump "$V1_DATABASE_URL"
pg_dump --format=custom --file=office_ledger_hrms_$(date +%F).dump "$HRMS_OWNER_DATABASE_URL"
```

Store both off the database host. Test a restore of the new one into a scratch database.

## 4. Production environment

### Backend

| Variable | Value |
|---|---|
| `HRMS_V2_ENABLED` | `true` |
| `HRMS_DATABASE_URL` | `postgres://hrms_api:<secret>@host:5432/office_ledger_hrms`. The app role, never the owner. |
| `MFA_ENCRYPTION_KEY` | 32 random bytes as 64 hex characters (`openssl rand -hex 32`). Required with the flag. Losing it locks out every gameMaster, CEO and COO, so store it with the other secrets and back it up separately. |
| `HRMS_JOBS_ENABLED` | `true` (default). `false` stops expiry, reminders, auto check-out, scores and email. |
| `MAIL_TRANSPORT` | `log` until a real transport exists (see the blocker above). `none` drops mail. |
| `FRONTEND_URL`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `TRUST_PROXY`, `JWT_ACCESS_SECRET`, `REDIS_URL` | As in `docs/production.md`. v2 cookies (`hrms_access`, `hrms_refresh`) use the same domain settings. |
| `DATABASE_URL` | Still required while v1 runs. |
| `HRMS_MIGRATE_DATABASE_URL` | Not set on the API host. Only the migrate and bootstrap commands read it. |

### Frontend (compiled in; set at build time)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.example.com/api/v1` (v2 is derived from it as `/api`) |
| `NEXT_PUBLIC_HRMS_API_URL` | Only if the v2 API is on a different base than `NEXT_PUBLIC_API_URL` implies |
| `NEXT_PUBLIC_HRMS_ENABLED` | `true`. With `false` every `/hrms` page returns 404. |

## 5. Switching on, and back

Order: API flag, then frontend flag. Each can be turned off on its own.

- **How people arrive:** the v1 login and change-password pages were removed in Phase 3, so
  `/` and every old URL already send a signed-out visitor to `/hrms/login`, and `/login` and
  `/change-password` redirect there. There is no separate default-login flag.
- **Back out of the screens:** build the frontend with `NEXT_PUBLIC_HRMS_ENABLED=false`.
  `/hrms` returns 404.
- **Back out of the API:** `HRMS_V2_ENABLED=false` and restart. No `/api` route exists.
  Nothing in the v1 database changed, and data created in the new database stays there.
- **Stop only the background work:** `HRMS_JOBS_ENABLED=false`.

## 6. After the switch

- Watch the API log for `HrmsErrorFilter` entries and failed jobs (`HrmsJobs`).
- Check `job_runs.last_run_at` advances for all seven jobs.
- Cleanup (delete v1 code, old migrations, flags; rename `/api` to `/api`; update `CLAUDE.md`
  and `docs/production.md`) is Phase 16, only when asked.
