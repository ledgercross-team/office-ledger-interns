-- =====================================================================
-- 0004: when each scheduled job last ran.
-- Every API instance wakes up on its own timer. A job runs only when its
-- interval has passed here, and only under an advisory lock, so two copies
-- of the API run each job once. No row-level security: a job belongs to the
-- platform, not to one org.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE TABLE job_runs (
    job          text        PRIMARY KEY,
    last_run_at  timestamptz NOT NULL DEFAULT 'epoch',
    last_result  jsonb
);

GRANT SELECT, INSERT, UPDATE ON job_runs TO hrms_app;
COMMIT;
