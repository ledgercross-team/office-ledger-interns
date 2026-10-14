-- =====================================================================
-- 0002: login sessions (refresh tokens) and one-time email links for the new backend.
-- Run after hrms_schema.sql. The first schema file has no session table,
-- and the old app's refresh_tokens table lives in the old database.
-- Same design as the old one: only a hash of the token is stored; each
-- refresh replaces the token and a reused token revokes the whole chain.
-- No row-level security: a session belongs to a user, not to one org.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE TABLE refresh_tokens (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES users(id),
    token_hash    text        NOT NULL UNIQUE,         -- SHA-256 of the opaque token
    member_id     uuid,                                -- the org membership active in this session
    expires_at    timestamptz NOT NULL,
    revoked_at    timestamptz,
    replaced_by   uuid REFERENCES refresh_tokens(id),
    ip_address    inet,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- One-time links by email: a new person's first password, or a password reset.
CREATE TABLE password_resets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users(id),
    purpose     text        NOT NULL CHECK (purpose IN ('invite', 'reset', 'ceo_recovery')),
    token_hash  text        NOT NULL UNIQUE,         -- SHA-256 of the token that is in the email link
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id) WHERE used_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO hrms_app;
GRANT SELECT, INSERT, UPDATE ON password_resets TO hrms_app;
COMMIT;
