# Going live

The old application is gone: there are no flags to switch and no second system to fall back
to. The way back is `git checkout pre-hrms` plus the old database restored from its dump.
Deploying and configuring are in [`docs/production.md`](../production.md); this is the
walkthrough to run on staging before real people use it.

## Before anything

| Check | How |
|---|---|
| Lint, typecheck, unit tests, builds | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter backend build && pnpm --filter frontend build` |
| Integration tests ran | Set `HRMS_TEST_APP_URL` and `HRMS_TEST_OWNER_URL` to a throwaway database. The suites skip silently without them, so check the count. |
| Rule tests are green on a throwaway database | `backend/scripts/hrms-rule-tests.sh` (refuses any name not ending `_throwaway` or `_test`). **Never on the real database.** |
| Security review is closed | `docs/hrms/SECURITY_REVIEW.md` (F4 and F5 are accepted risks) |
| Backups exist | `pg_dump --format=custom` of the production database, and the old v1 dump kept |
| A real email transport exists | **Open blocker.** Only `MAIL_TRANSPORT=log` and `none` exist. Add SMTP or a provider before inviting anyone. |

## Staging walk-through, in order

1. Create the database and the `hrms_api` login (`docs/hrms/README.md`).
2. `pnpm db:migrate` (owner login). Applies the schema and the numbered files once each.
3. `pnpm db:create-game-master` (owner login, once). Clear the password from shell history.
4. Start the API and build the frontend with the variables in `docs/production.md`.
5. As people, not scripts:
   - The gameMaster signs in (enrols an authenticator) and creates an organisation with a CEO.
   - The CEO opens the emailed link, sets a password, signs in with a code.
   - The CEO adds a manager and an employee, creates a project and a task.
   - The employee checks in from an office network (add one in settings) and is refused from another.
   - A request is filed, decided and applied; the bell shows the notification.
6. Within ten minutes `hrms.job_runs` has a row for each of the seven jobs. A second API instance
   does not change the run counts.

`backend/src/hrms/cutover.integration.spec.ts` runs the same chain from the API.

## Back out

- **A bad deploy:** redeploy the previous build. Database changes are additive numbered
  files, so the previous build keeps working with them.
- **Stop background work only:** `HRMS_JOBS_ENABLED=false`.
- **Back to the old system:** `git checkout pre-hrms`, restore the old database from its dump.
  Data created in the new database stays there.
