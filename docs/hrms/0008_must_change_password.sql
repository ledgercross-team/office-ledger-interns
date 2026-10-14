-- =====================================================================
-- 0008: a person given a temporary password (a new gameMaster) must
-- choose their own before doing anything else.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

COMMIT;
