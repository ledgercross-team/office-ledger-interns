-- =====================================================================
-- 0012: a CEO or COO can require someone to set up the authenticator.
-- The person signs in with their password, is sent to Profile → Security,
-- and cannot use anything else until they have scanned and confirmed a
-- code. The admin never sees the secret.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE users ADD COLUMN mfa_setup_required boolean NOT NULL DEFAULT false;

COMMIT;
