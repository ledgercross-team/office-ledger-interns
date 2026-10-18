-- =====================================================================
-- 0007: authenticator sign-in is opt-in per person (Profile → Security).
-- Backup codes are single-use stand-ins for the 6-digit code, kept as
-- hashes only. Not audited: the codes are credentials.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE TABLE user_mfa_backup_codes (
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  text        NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, code_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa_backup_codes TO hrms_app;
COMMIT;
