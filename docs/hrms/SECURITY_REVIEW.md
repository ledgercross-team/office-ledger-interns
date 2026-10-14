# Security review of the v2 routes (Phase 13)

Scope: every controller under `backend/src/hrms` (89 routes, listed by decorator). Checked by
reading the code, by a route inventory generated from the decorators, and by tests.

## Result

| Check | Result |
|---|---|
| Every route has a role list, `@HrmsSession()` or `@Public()` | Pass. 89 of 89. The guard is deny-by-default, so a new route without a decorator is closed. |
| Public routes are public on purpose | `auth/login`, `auth/refresh`, `auth/accept-invite`, `auth/mfa/enroll`, `auth/mfa/verify`, `health`. The two MFA routes take the short-lived pending token from login. All are rate limited except health. |
| No password, hash, token or MFA secret in a response | Pass. Members, audit and export strip secret columns. The enrol response returns the new authenticator key once, to the person enrolling, by design. |
| No password or token in a log | One finding, fixed (F1). |
| Temporary passwords are gone from v2 | Pass. Invites use a one-time link. Still present in v1 (F3). |
| No route returns another organisation's data | Pass. Row-level security plus the `mfa.integration.spec.ts` probe of reads, lists and writes by id. |
| Sign-in routes are rate limited | Pass. Login by IP and email, MFA codes by pending token, refresh, switch-org, change-password, accept-invite. |
| SQL injection | Pass. Parameterised throughout. The `sql.raw` uses take only UUIDs validated by DTO, integers, or constants. |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | Medium | drizzle error text holds the whole statement and its parameters. An unexpected database error would have written a password hash, a one-time token or an MFA secret blob to the log. | Fixed: logs now carry only the database error code, message and constraint (`describeError`). |
| F2 | Low | Code guesses are limited per IP. Spreading them over many addresses would multiply the allowance. | Fixed: MFA attempts are counted per pending token. |
| F3 | Medium | The v1 gameMaster service still returns a `temporaryPassword` in its responses and v1 screens show it. | Open, outside this phase. Phase 14 replaces the gameMaster console and Phase 16 deletes v1. |
| F4 | Low | A CEO or COO adding a person by email learns whether that email already has an account (`attached` vs `invited`). This follows from one login belonging to several orgs. | Open. Accepted by the design; mention in the privacy notice. |
| F5 | Low | A one-time code can be reused inside its 30-second window and the pending token inside its 5 minutes. Needs the password as well. | Open. Closing it needs a "last used step" column (a new numbered SQL file). |
| F6 | Info | Sessions that existed before someone became CEO or COO are stopped by the guard (`MFA_REQUIRED`) until they sign in again with a code. | Fixed in this phase. |
| F7 | Info | Export builds one JSON document in memory. Fine for the plan limits; stream it if orgs grow much larger. | Open. |
