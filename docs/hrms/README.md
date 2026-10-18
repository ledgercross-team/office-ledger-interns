# Office Ledger HRMS: PostgreSQL schema

| File | What it is |
|---|---|
| `hrms_schema.sql` | The complete consolidated schema: tables, views, triggers, functions, migrations and row-level security. Needs PostgreSQL 15 or newer. |
| `migrations-archive/` | Historical numbered migration files retained for reference; they are not applied by the current runner. |
| `hrms_rule_tests.sql` | 116 checks. **Run only on a throwaway database.** It adds sample data and changes plan limits. |
| `RUNBOOK.md` | The migration plan: 16 phases, gates and a prompt for Claude Code at each one. |
| `er-diagram.md` | The entity-relationship diagrams as Mermaid, generated from the live database. |

## Install
```
createdb office_ledger_hrms
psql -d office_ledger_hrms -v ON_ERROR_STOP=1 -f hrms_schema.sql
```
Then create the login role the app uses:
```
CREATE ROLE hrms_api LOGIN PASSWORD '<secret>' IN ROLE hrms_app;
ALTER ROLE hrms_api SET search_path = hrms, public;
```
The app must connect as `hrms_api`, never as the owner. The owner skips row-level security.

## What the app does on every request
Open a transaction and set:
```
select set_config('app.org_id',    '<org uuid>', true),
       set_config('app.member_id', '<org_members.id>', true),
       set_config('app.user_id',   '<users.id>', true),
       set_config('app.client_ip', '<caller ip>', true);
```
- `app.org_id` limits every query to one org.
- `app.member_id` tells the permission triggers who is acting. Leave it empty for scheduled jobs.

## Where row-level security would hide everything
These functions run with the owner's rights, return only what the screen needs, and check who is asking:
- `my_memberships(user_id)`: login and the org switcher (set `app.user_id` first).
- `gm_list_orgs`, `gm_create_org`, `gm_set_org_blocked`, `gm_set_org_plan`, `gm_list_platform_requests`, `gm_verify_platform_request`, `gm_complete_remove_last_ceo`: the gameMaster console. Call each in its own transaction with `app.org_id` empty.
- `list_active_org_ids()`: scheduled jobs loop over these, setting `app.org_id` for each.

## Scheduled jobs
Run each per org (set `app.org_id`, leave `app.member_id` empty).
| Function | When |
|---|---|
| `job_expire_pending()` | Every few minutes. Expires requests and invites past 3 working days. |
| `job_auto_checkout(org, day)` | End of each org's day. |
| `job_compute_performance(org, date)` | Nightly. |

## Things the app still does
- Send notifications and emails (the `notifications` table holds them).
- Perform the action after a request is approved (for example create the user), in one transaction, then mark the request applied.
- Move subscription status through grace, read-only and suspended.
- Decide who may read what inside an org. Row-level security separates orgs. The database itself guards two reads: performance scores (CEO and COO only) and raw ratings (nobody).

See `RUNBOOK.md` for the full list and the order to build things in.
