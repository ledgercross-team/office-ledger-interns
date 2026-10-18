
-- ===== BEGIN docs/hrms/hrms_schema.sql =====
-- =====================================================================
-- Office Ledger HRMS: PostgreSQL schema (implements plan-v3.md)
-- Target: PostgreSQL 15+
--
-- Conventions
--   * Every org-scoped table carries org_id, and child rows reference
--     parents through composite (id, org_id) foreign keys. A row can
--     therefore never point at another org's data, even if the
--     application has a bug (plan §10: org isolation).
--   * The application must open every transaction with
--         SET LOCAL app.org_id    = '<org uuid>';
--         SET LOCAL app.member_id = '<org_members.id of the actor>';
--         SET LOCAL app.user_id   = '<users.id of the actor>';
--         SET LOCAL app.client_ip = '<ip>';
--     Row-level security uses app.org_id; permission triggers use
--     app.member_id. Background jobs run with no app.member_id
--     ("system" context), which skips actor checks.
--   * Nothing is hard-deleted except where noted. History lives in
--     audit_log, which is append-only.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS hrms;
SET search_path = hrms, public;

-- ---------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------
CREATE TYPE member_role        AS ENUM ('ceo', 'coo', 'manager', 'employee');
CREATE TYPE member_status      AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE org_status         AS ENUM ('active', 'grace', 'read_only', 'suspended', 'blocked');
CREATE TYPE gm_status          AS ENUM ('pending_confirmation', 'active', 'removed');
CREATE TYPE project_status     AS ENUM ('active', 'pending_lead_approval', 'completed', 'archived');
CREATE TYPE project_role       AS ENUM ('manager', 'employee');
CREATE TYPE task_status        AS ENUM ('todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled');
CREATE TYPE task_urgency       AS ENUM ('high', 'medium', 'low');
CREATE TYPE request_type       AS ENUM (
    'create_user',           -- manager asks for a new account (always CEO/COO)
    'create_project',        -- COO asks to create a project (CEO only)
    'add_to_project',        -- manager asks to add an existing member to a project
    'create_task',           -- manager with approval switch ON
    'assign_task',           -- manager with approval switch ON
    'add_and_assign',        -- assignee not on the project yet: one combined request
    'leave',                 -- leave request
    'leave_change',          -- change/cancel leave that has already started
    'attendance_correction'  -- fix a wrong or missing attendance entry
);
CREATE TYPE request_status     AS ENUM ('pending', 'approved', 'applied', 'rejected', 'cancelled', 'expired');
CREATE TYPE invite_status      AS ENUM ('pending', 'accepted', 'declined', 'decline_accepted', 'overruled', 'expired');
CREATE TYPE attendance_status  AS ENUM ('present', 'late', 'absent', 'on_leave', 'holiday', 'weekend');
CREATE TYPE rsvp_status        AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE platform_req_type  AS ENUM ('ceo_recovery', 'remove_last_ceo');
CREATE TYPE platform_req_status AS ENUM ('pending', 'verified', 'completed', 'rejected');
CREATE TYPE performance_band   AS ENUM ('excellent', 'good', 'needs_attention', 'poor');

-- ---------------------------------------------------------------------
-- 2. Session helpers
-- ---------------------------------------------------------------------
CREATE FUNCTION current_org_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE FUNCTION current_member_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.member_id', true), '')::uuid $$;

CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT current_member_id() IS NULL $$;

-- ---------------------------------------------------------------------
-- 3. Platform: users, gameMasters, plans
-- ---------------------------------------------------------------------

-- One login per person, shared across every org they belong to (§1).
CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email              citext      NOT NULL UNIQUE,
    email_verified_at  timestamptz,
    password_hash      text        NOT NULL,
    full_name          text        NOT NULL CHECK (length(trim(full_name)) > 0),
    phone              text,
    timezone           text        NOT NULL DEFAULT 'UTC',  -- calendar shows times in this zone (§6)
    mfa_enabled        boolean     NOT NULL DEFAULT false,  -- required at login for gameMaster/CEO/COO (§10)
    mfa_secret_enc     bytea,
    last_login_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT mfa_enabled OR mfa_secret_enc IS NOT NULL)
);

-- gameMasters: a new one needs a second, different gameMaster to confirm (§1).
CREATE TABLE game_masters (
    user_id       uuid PRIMARY KEY REFERENCES users(id),
    status        gm_status   NOT NULL DEFAULT 'pending_confirmation',
    created_by    uuid REFERENCES game_masters(user_id),   -- NULL only for the bootstrap gameMaster
    confirmed_by  uuid REFERENCES game_masters(user_id),
    confirmed_at  timestamptz,
    removed_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (confirmed_by IS NULL OR confirmed_by <> created_by),
    CHECK (confirmed_by IS NULL OR confirmed_by <> user_id),
    CHECK (status <> 'active' OR created_by IS NULL OR confirmed_by IS NOT NULL),
    CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

CREATE TABLE plans (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    seat_limit  integer NOT NULL CHECK (seat_limit > 0)  -- managers + employees only (§1)
);
INSERT INTO plans (code, name, seat_limit) VALUES
    ('standard', 'Standard', 2000),
    ('premium',  'Premium',  5000);

-- ---------------------------------------------------------------------
-- 4. Organisations and members
-- ---------------------------------------------------------------------
CREATE TABLE orgs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text        NOT NULL,
    plan_code          text        NOT NULL REFERENCES plans(code),
    status             org_status  NOT NULL DEFAULT 'active',
    created_by_gm      uuid        REFERENCES game_masters(user_id),
    -- subscription lifecycle (§9): grace 7 days -> read-only 10 days -> suspended, purge 15 days later
    payment_failed_at  timestamptz,
    grace_ends_at      timestamptz,
    read_only_ends_at  timestamptz,
    suspended_at       timestamptz,
    purge_after        timestamptz,
    -- abuse block by a gameMaster (§1)
    blocked_by_gm      uuid        REFERENCES game_masters(user_id),
    blocked_reason     text,
    blocked_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'blocked'   OR (blocked_by_gm IS NOT NULL AND blocked_reason IS NOT NULL AND blocked_at IS NOT NULL)),
    CHECK (status <> 'grace'     OR grace_ends_at IS NOT NULL),
    CHECK (status <> 'read_only' OR read_only_ends_at IS NOT NULL),
    CHECK (status <> 'suspended' OR (suspended_at IS NOT NULL AND purge_after IS NOT NULL))
);

-- Org-wide settings the CEO can change.
CREATE TABLE org_settings (
    org_id                       uuid PRIMARY KEY REFERENCES orgs(id),
    timezone                     text     NOT NULL DEFAULT 'UTC',
    work_start_time              time     NOT NULL DEFAULT '09:00',
    late_grace_minutes           integer  NOT NULL DEFAULT 15 CHECK (late_grace_minutes BETWEEN 0 AND 240),
    weekend_days                 smallint[] NOT NULL DEFAULT '{6,7}'          -- ISO day of week, 1 = Mon … 7 = Sun
                                 CHECK (weekend_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
    request_expiry_working_days  integer  NOT NULL DEFAULT 3 CHECK (request_expiry_working_days > 0),
    -- workload colours (§7)
    workload_amber_tasks         integer  NOT NULL DEFAULT 6,
    workload_amber_projects      integer  NOT NULL DEFAULT 3,
    workload_red_tasks           integer  NOT NULL DEFAULT 10,
    workload_red_projects        integer  NOT NULL DEFAULT 5,
    -- performance score (§13)
    weight_attendance            integer  NOT NULL DEFAULT 30,
    weight_rating                integer  NOT NULL DEFAULT 50,
    weight_ontime                integer  NOT NULL DEFAULT 20,
    points_late                  numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (points_late BETWEEN 0 AND 1),
    points_missing_checkout      numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (points_missing_checkout BETWEEN 0 AND 1),
    points_unpaid_leave          numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (points_unpaid_leave BETWEEN 0 AND 1),
    rating_min_count             integer  NOT NULL DEFAULT 3 CHECK (rating_min_count >= 1),
    rating_prior_weight          integer  NOT NULL DEFAULT 3 CHECK (rating_prior_weight >= 0),
    rating_window_days           integer  NOT NULL DEFAULT 7 CHECK (rating_window_days > 0),
    high_urgency_reminder_hours  integer  NOT NULL DEFAULT 24,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CHECK (workload_red_tasks > workload_amber_tasks AND workload_red_projects > workload_amber_projects),
    CHECK (weight_attendance >= 0 AND weight_rating >= 0 AND weight_ontime >= 0
           AND weight_attendance + weight_rating + weight_ontime = 100)
);

-- Office networks: check-in only works from these (§12).
CREATE TABLE org_office_networks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES orgs(id),
    network     cidr NOT NULL,
    label       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, network)
);

CREATE TABLE org_holidays (
    org_id        uuid NOT NULL REFERENCES orgs(id),
    holiday_date  date NOT NULL,
    name          text NOT NULL,
    PRIMARY KEY (org_id, holiday_date)
);

-- Subscription history (one row per period / plan change).
CREATE TABLE subscriptions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                uuid NOT NULL REFERENCES orgs(id),
    plan_code             text NOT NULL REFERENCES plans(code),
    current_period_start  timestamptz NOT NULL,
    current_period_end    timestamptz NOT NULL,
    payment_status        text NOT NULL CHECK (payment_status IN ('paid', 'failed', 'refunded', 'pending')),
    external_ref          text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (current_period_end > current_period_start)
);

-- A person's membership in one org. Same user can be in many orgs and
-- uses one seat in each (§1).
CREATE TABLE org_members (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  uuid          NOT NULL REFERENCES orgs(id),
    user_id                 uuid          NOT NULL REFERENCES users(id),
    role                    member_role   NOT NULL,
    status                  member_status NOT NULL DEFAULT 'active',
    -- per-manager switches set by CEO/COO (§3)
    task_approval_required  boolean NOT NULL DEFAULT false,
    can_view_all_projects   boolean NOT NULL DEFAULT false,
    -- org-level profile fields (managers can make simple edits)
    designation             text,
    department              text,
    employee_code           text,
    joined_at               timestamptz NOT NULL DEFAULT now(),
    last_active_at          timestamptz,             -- used to sort downgrade candidates (§9)
    suspended_at            timestamptz,
    deactivated_at          timestamptz,
    deactivated_by          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, user_id),
    UNIQUE (id, org_id),
    UNIQUE (org_id, employee_code),
    FOREIGN KEY (deactivated_by, org_id) REFERENCES org_members(id, org_id),
    CHECK (role = 'manager' OR (task_approval_required = false AND can_view_all_projects = false)),
    CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL)),
    CHECK ((status = 'suspended')   = (suspended_at   IS NOT NULL))
);
CREATE INDEX org_members_org_role_idx ON org_members (org_id, role) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- 5. Projects and tasks
-- ---------------------------------------------------------------------
CREATE TABLE projects (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                   uuid NOT NULL REFERENCES orgs(id),
    name                     text NOT NULL CHECK (length(trim(name)) > 0),
    description              text,
    status                   project_status NOT NULL DEFAULT 'active',
    start_date               date,
    due_date                 date,
    created_by               uuid NOT NULL,           -- CEO, or the COO whose request was approved
    created_via_request      uuid,                    -- set when a COO's create_project request was applied
    completion_requested_at  timestamptz,             -- all managers ticked
    completed_at             timestamptz,
    completion_approved_by   uuid,
    rating_closes_at         timestamptz,
    archived_at              timestamptz,
    archived_by              uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, org_id),
    FOREIGN KEY (created_by, org_id)             REFERENCES org_members(id, org_id),
    FOREIGN KEY (completion_approved_by, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (archived_by, org_id)            REFERENCES org_members(id, org_id),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CHECK (status <> 'pending_lead_approval' OR completion_requested_at IS NOT NULL),
    CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completion_approved_by IS NOT NULL AND rating_closes_at IS NOT NULL)),
    CHECK ((status = 'archived') = (archived_at IS NOT NULL AND archived_by IS NOT NULL))
);

-- Managers and employees on a project. CEO/COO are never project members.
CREATE TABLE project_members (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL,
    project_id         uuid NOT NULL,
    member_id          uuid NOT NULL,
    role               project_role NOT NULL,
    is_lead            boolean NOT NULL DEFAULT false,   -- "project lead" tag, set by CEO/COO (§2)
    lead_tagged_by     uuid,
    added_by           uuid,
    added_via_invite   uuid,
    added_at           timestamptz NOT NULL DEFAULT now(),
    removed_at         timestamptz,
    removed_by         uuid,
    UNIQUE (id, org_id),
    FOREIGN KEY (project_id, org_id)     REFERENCES projects(id, org_id),
    FOREIGN KEY (member_id, org_id)      REFERENCES org_members(id, org_id),
    FOREIGN KEY (lead_tagged_by, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (added_by, org_id)       REFERENCES org_members(id, org_id),
    FOREIGN KEY (removed_by, org_id)     REFERENCES org_members(id, org_id),
    CHECK (NOT is_lead OR role = 'manager'),
    CHECK (NOT is_lead OR lead_tagged_by IS NOT NULL),
    CHECK (removed_at IS NULL OR NOT is_lead)
);
CREATE UNIQUE INDEX project_members_active_uq ON project_members (project_id, member_id) WHERE removed_at IS NULL;
CREATE INDEX project_members_member_idx ON project_members (member_id) WHERE removed_at IS NULL;

-- Each manager ticks "done" before a lead approves completion (§5).
CREATE TABLE project_completion_ticks (
    org_id      uuid NOT NULL,
    project_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    ticked_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, member_id),
    FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id),
    FOREIGN KEY (member_id, org_id)  REFERENCES org_members(id, org_id)
);

CREATE TABLE tasks (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                uuid NOT NULL,
    project_id            uuid NOT NULL,
    title                 text NOT NULL CHECK (length(trim(title)) > 0),
    description           text,
    status                task_status  NOT NULL DEFAULT 'todo',
    urgency               task_urgency NOT NULL,
    due_at                timestamptz  NOT NULL,
    status_comment        text,          -- reason/comment for the latest status change
    blocked_reason        text,
    cancel_reason         text,
    completed_at          timestamptz,
    created_by            uuid NOT NULL,
    created_via_request   uuid,          -- required when the creating manager's approval switch is ON
    high_reminder_sent_at timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, org_id),
    FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id),
    FOREIGN KEY (created_by, org_id) REFERENCES org_members(id, org_id),
    CHECK (status <> 'blocked'   OR blocked_reason IS NOT NULL),
    CHECK (status <> 'cancelled' OR cancel_reason  IS NOT NULL),
    CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX tasks_project_idx ON tasks (project_id, status);
CREATE INDEX tasks_due_idx     ON tasks (org_id, due_at) WHERE status NOT IN ('done', 'cancelled');

CREATE TABLE task_assignees (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               uuid NOT NULL,
    task_id              uuid NOT NULL,
    member_id            uuid NOT NULL,
    role                 project_role NOT NULL,
    assigned_by          uuid,
    assigned_via_request uuid,
    assigned_at          timestamptz NOT NULL DEFAULT now(),
    removed_at           timestamptz,
    removed_by           uuid,
    FOREIGN KEY (task_id, org_id)     REFERENCES tasks(id, org_id),
    FOREIGN KEY (member_id, org_id)   REFERENCES org_members(id, org_id),
    FOREIGN KEY (assigned_by, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (removed_by, org_id)  REFERENCES org_members(id, org_id)
);
CREATE UNIQUE INDEX task_assignees_active_uq ON task_assignees (task_id, member_id) WHERE removed_at IS NULL;
CREATE INDEX task_assignees_member_idx ON task_assignees (member_id) WHERE removed_at IS NULL;

CREATE TABLE task_status_history (
    id           bigserial PRIMARY KEY,
    org_id       uuid NOT NULL,
    task_id      uuid NOT NULL,
    from_status  task_status,
    to_status    task_status NOT NULL,
    comment      text,
    changed_by   uuid,
    changed_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (task_id, org_id)    REFERENCES tasks(id, org_id),
    FOREIGN KEY (changed_by, org_id) REFERENCES org_members(id, org_id)
);

-- ---------------------------------------------------------------------
-- 6. Requests and approvals (§3)
-- ---------------------------------------------------------------------
CREATE TABLE requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL,
    type               request_type   NOT NULL,
    status             request_status NOT NULL DEFAULT 'pending',
    requested_by       uuid NOT NULL,
    project_id         uuid,
    subject_member_id  uuid,          -- the member the request is about (added / assigned)
    task_id            uuid,
    payload            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- type-specific data, e.g. new user's name/email/role, project name
    reason             text,          -- requester's explanation
    dedupe_key         text,          -- identical pending requests merge on this key
    decided_by         uuid,
    decided_at         timestamptz,
    decision_reason    text,
    applied_at         timestamptz,
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, org_id),
    FOREIGN KEY (requested_by, org_id)      REFERENCES org_members(id, org_id),
    FOREIGN KEY (project_id, org_id)        REFERENCES projects(id, org_id),
    FOREIGN KEY (subject_member_id, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (task_id, org_id)           REFERENCES tasks(id, org_id),
    FOREIGN KEY (decided_by, org_id)        REFERENCES org_members(id, org_id),
    CHECK (status NOT IN ('approved', 'applied', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    CHECK (status <> 'rejected' OR length(trim(coalesce(decision_reason, ''))) > 0),
    CHECK (status <> 'applied'  OR applied_at IS NOT NULL),
    CHECK (type NOT IN ('add_to_project', 'create_task', 'assign_task', 'add_and_assign') OR project_id IS NOT NULL),
    CHECK (type NOT IN ('add_to_project', 'add_and_assign', 'assign_task') OR subject_member_id IS NOT NULL),
    CHECK (type NOT IN ('assign_task', 'add_and_assign') OR task_id IS NOT NULL),
    CHECK (type <> 'create_user' OR (payload ? 'email' AND payload ? 'full_name' AND payload->>'role' IN ('manager', 'employee'))),
    CHECK (type <> 'create_project' OR payload ? 'name')
);
CREATE UNIQUE INDEX requests_dedupe_uq ON requests (org_id, dedupe_key) WHERE status = 'pending' AND dedupe_key IS NOT NULL;
CREATE INDEX requests_queue_idx ON requests (org_id, status, type, project_id);

ALTER TABLE projects       ADD FOREIGN KEY (created_via_request, org_id)  REFERENCES requests(id, org_id);
ALTER TABLE tasks          ADD FOREIGN KEY (created_via_request, org_id)  REFERENCES requests(id, org_id);
ALTER TABLE task_assignees ADD FOREIGN KEY (assigned_via_request, org_id) REFERENCES requests(id, org_id);

-- Project invites (§4). Accept = joined. Decline -> reviewed by the inviter.
CREATE TABLE project_invites (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL,
    project_id         uuid NOT NULL,
    invitee_member_id  uuid NOT NULL,
    role               project_role NOT NULL,
    invited_by         uuid NOT NULL,
    request_id         uuid,            -- the approved add_to_project / add_and_assign request, for manager-sent invites
    status             invite_status NOT NULL DEFAULT 'pending',
    decline_reason     text,
    review_reason      text,            -- inviter's reason when overruling (shown to the employee)
    responded_at       timestamptz,
    reviewed_at        timestamptz,
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, org_id),
    FOREIGN KEY (project_id, org_id)        REFERENCES projects(id, org_id),
    FOREIGN KEY (invitee_member_id, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (invited_by, org_id)        REFERENCES org_members(id, org_id),
    FOREIGN KEY (request_id, org_id)        REFERENCES requests(id, org_id),
    CHECK (invitee_member_id <> invited_by),
    CHECK (status NOT IN ('declined', 'decline_accepted', 'overruled') OR length(trim(coalesce(decline_reason, ''))) > 0),
    CHECK (status <> 'overruled' OR length(trim(coalesce(review_reason, ''))) > 0)
);
CREATE UNIQUE INDEX project_invites_pending_uq ON project_invites (project_id, invitee_member_id)
    WHERE status IN ('pending', 'declined');

ALTER TABLE project_members ADD FOREIGN KEY (added_via_invite, org_id) REFERENCES project_invites(id, org_id);

-- ---------------------------------------------------------------------
-- 7. Calendar: meetings (§6)
-- ---------------------------------------------------------------------
CREATE TABLE meetings (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES orgs(id),
    title         text NOT NULL CHECK (length(trim(title)) > 0),
    description   text,
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz NOT NULL,
    meeting_link  text,
    location      text,
    project_id    uuid,
    created_by    uuid NOT NULL,
    cancelled_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, org_id),
    FOREIGN KEY (created_by, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id),
    CHECK (ends_at > starts_at),
    -- online meetings need a link, in-person meetings need a location: exactly one
    CHECK (num_nonnulls(meeting_link, location) = 1),
    CHECK (meeting_link IS NULL OR meeting_link ~* '^https?://[^\s]+$'),
    CHECK (location IS NULL OR length(trim(location)) > 0)
);

CREATE TABLE meeting_invitees (
    org_id      uuid NOT NULL,
    meeting_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    response    rsvp_status NOT NULL DEFAULT 'pending',
    PRIMARY KEY (meeting_id, member_id),
    FOREIGN KEY (meeting_id, org_id) REFERENCES meetings(id, org_id),
    FOREIGN KEY (member_id, org_id)  REFERENCES org_members(id, org_id)
);

-- ---------------------------------------------------------------------
-- 8. Leave and attendance (§12)
-- ---------------------------------------------------------------------
CREATE TABLE leave_types (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                 uuid NOT NULL REFERENCES orgs(id),
    code                   text NOT NULL,
    name                   text NOT NULL,
    yearly_allowance_days  numeric(5,1) NOT NULL CHECK (yearly_allowance_days >= 0),
    is_paid                boolean NOT NULL,
    is_active              boolean NOT NULL DEFAULT true,
    UNIQUE (org_id, code),
    UNIQUE (id, org_id)
);

-- One row per leave request; the approval itself lives in requests.
CREATE TABLE leave_requests (
    request_id       uuid PRIMARY KEY,
    org_id           uuid NOT NULL,
    member_id        uuid NOT NULL,
    leave_type_id    uuid NOT NULL,
    start_date       date NOT NULL,
    end_date         date NOT NULL,
    start_half_day   boolean NOT NULL DEFAULT false,
    end_half_day     boolean NOT NULL DEFAULT false,
    days             numeric(5,1) NOT NULL CHECK (days > 0),   -- working days, computed by the app/function
    reason           text NOT NULL CHECK (length(trim(reason)) > 0),
    over_allowance   boolean NOT NULL DEFAULT false,           -- excess counts as unpaid (§12)
    cancelled_at     timestamptz,                              -- cancelled before it started
    UNIQUE (request_id, org_id),
    FOREIGN KEY (request_id, org_id)    REFERENCES requests(id, org_id),
    FOREIGN KEY (member_id, org_id)     REFERENCES org_members(id, org_id),
    FOREIGN KEY (leave_type_id, org_id) REFERENCES leave_types(id, org_id),
    CHECK (end_date >= start_date),
    CHECK (NOT (start_date = end_date AND start_half_day AND end_half_day))
);
CREATE INDEX leave_requests_member_idx ON leave_requests (member_id, start_date, end_date);

CREATE TABLE attendance_days (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL,
    member_id          uuid NOT NULL,
    work_date          date NOT NULL,
    status             attendance_status NOT NULL,
    check_in_at        timestamptz,
    check_in_ip        inet,
    check_out_at       timestamptz,
    check_out_ip       inet,
    auto_checked_out   boolean NOT NULL DEFAULT false,   -- "Missing check-out" flag
    worked_minutes     integer GENERATED ALWAYS AS
                       ((extract(epoch FROM (check_out_at - check_in_at)) / 60)::integer) STORED,
    leave_request_id   uuid,
    corrected_by_request uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (member_id, work_date),
    UNIQUE (id, org_id),
    FOREIGN KEY (member_id, org_id)            REFERENCES org_members(id, org_id),
    FOREIGN KEY (leave_request_id, org_id)     REFERENCES leave_requests(request_id, org_id),
    FOREIGN KEY (corrected_by_request, org_id) REFERENCES requests(id, org_id),
    CHECK (status NOT IN ('present', 'late') OR (check_in_at IS NOT NULL AND check_in_ip IS NOT NULL)),
    CHECK (check_out_at IS NULL OR check_out_at > check_in_at),
    CHECK (NOT auto_checked_out OR check_out_at IS NOT NULL),
    CHECK (status <> 'on_leave' OR leave_request_id IS NOT NULL)
);

CREATE TABLE attendance_corrections (
    request_id           uuid PRIMARY KEY,
    org_id               uuid NOT NULL,
    member_id            uuid NOT NULL,
    work_date            date NOT NULL,
    attendance_day_id    uuid,            -- NULL when the day has no entry at all
    requested_check_in   timestamptz,
    requested_check_out  timestamptz,
    reason               text NOT NULL CHECK (length(trim(reason)) > 0),
    original_snapshot    jsonb,           -- the entry as it was, kept forever
    FOREIGN KEY (request_id, org_id)        REFERENCES requests(id, org_id),
    FOREIGN KEY (member_id, org_id)         REFERENCES org_members(id, org_id),
    FOREIGN KEY (attendance_day_id, org_id) REFERENCES attendance_days(id, org_id),
    CHECK (requested_check_out IS NULL OR requested_check_in IS NULL OR requested_check_out > requested_check_in),
    CHECK (num_nonnulls(requested_check_in, requested_check_out) > 0)
);

-- ---------------------------------------------------------------------
-- 9. Ratings and performance (§13)
-- ---------------------------------------------------------------------
-- Raw ratings are anonymous: the application role gets NO select on this
-- table (see §15 at the bottom); only aggregates are exposed. Not audited,
-- because an audit row would reveal the rater.
CREATE TABLE project_ratings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid NOT NULL,
    project_id       uuid NOT NULL,
    rater_member_id  uuid NOT NULL,
    ratee_member_id  uuid NOT NULL,
    stars            smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment          text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, rater_member_id, ratee_member_id),
    FOREIGN KEY (project_id, org_id)      REFERENCES projects(id, org_id),
    FOREIGN KEY (rater_member_id, org_id) REFERENCES org_members(id, org_id),
    FOREIGN KEY (ratee_member_id, org_id) REFERENCES org_members(id, org_id),
    CHECK (rater_member_id <> ratee_member_id),
    CHECK (stars > 2 OR length(trim(coalesce(comment, ''))) > 0)
);
CREATE INDEX project_ratings_ratee_idx ON project_ratings (ratee_member_id, created_at);

-- Nightly snapshot, visible to CEO/COO only.
CREATE TABLE performance_scores (
    org_id             uuid NOT NULL,
    member_id          uuid NOT NULL,
    computed_on        date NOT NULL,
    window_start       date NOT NULL,
    working_days       numeric(6,1) NOT NULL,
    attendance_points  numeric(6,2) NOT NULL,
    attendance_score   numeric(5,2),
    rating_count       integer NOT NULL,
    rating_avg         numeric(4,3),
    rating_score       numeric(5,2),
    ontime_total       integer NOT NULL,
    ontime_on_time     integer NOT NULL,
    ontime_score       numeric(5,2),
    final_score        numeric(5,2) CHECK (final_score BETWEEN 0 AND 100),
    band               performance_band,
    is_new             boolean NOT NULL,
    has_ratings        boolean NOT NULL,
    PRIMARY KEY (member_id, computed_on),
    FOREIGN KEY (member_id, org_id) REFERENCES org_members(id, org_id),
    CHECK ((final_score IS NULL) = (band IS NULL))
);

-- ---------------------------------------------------------------------
-- 10. Platform requests: CEO recovery (§8) and last-CEO removal (§3)
-- ---------------------------------------------------------------------
CREATE TABLE platform_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL REFERENCES orgs(id),
    type               platform_req_type   NOT NULL,
    status             platform_req_status NOT NULL DEFAULT 'pending',
    requested_by       uuid NOT NULL,   -- COO (recovery) or CEO (last-CEO removal)
    target_member_id   uuid NOT NULL,   -- the CEO concerned
    replacement_user_id uuid REFERENCES users(id),  -- new CEO for remove_last_ceo
    new_email          citext,          -- newly verified email for the reset link
    verified_by_gm     uuid REFERENCES game_masters(user_id),
    verified_at        timestamptz,
    reset_token_hash   text,            -- never the password itself
    reset_expires_at   timestamptz,
    completed_at       timestamptz,
    notes              text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (requested_by, org_id)     REFERENCES org_members(id, org_id),
    FOREIGN KEY (target_member_id, org_id) REFERENCES org_members(id, org_id),
    CHECK (status NOT IN ('verified', 'completed') OR (verified_by_gm IS NOT NULL AND verified_at IS NOT NULL)),
    CHECK (type <> 'ceo_recovery'    OR new_email IS NOT NULL),
    CHECK (type <> 'remove_last_ceo' OR replacement_user_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 11. History and notifications (§10, §11)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id               bigserial PRIMARY KEY,
    org_id           uuid REFERENCES orgs(id),   -- NULL for platform-level events
    actor_user_id    uuid REFERENCES users(id),
    actor_member_id  uuid,
    action           text NOT NULL,             -- INSERT / UPDATE / DELETE or a domain verb
    table_name       text NOT NULL,
    row_id           text,
    old_data         jsonb,
    new_data         jsonb,
    client_ip        inet,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_idx ON audit_log (org_id, created_at DESC);
CREATE INDEX audit_log_row_idx ON audit_log (table_name, row_id);

-- CEO notes/corrections on history entries. The original row never changes.
CREATE TABLE audit_notes (
    id          bigserial PRIMARY KEY,
    audit_id    bigint NOT NULL REFERENCES audit_log(id),
    org_id      uuid NOT NULL,
    author_id   uuid NOT NULL,
    note        text NOT NULL CHECK (length(trim(note)) > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (author_id, org_id) REFERENCES org_members(id, org_id)
);

CREATE TABLE notifications (
    id                 bigserial PRIMARY KEY,
    org_id             uuid NOT NULL,
    recipient_id       uuid NOT NULL,
    kind               text NOT NULL,      -- e.g. request_needs_decision, request_decided, high_urgency_task, seat_warning
    needs_decision     boolean NOT NULL DEFAULT false,
    entity_table       text,
    entity_id          uuid,
    title              text NOT NULL,
    body               text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    read_at            timestamptz,
    email_sent_at      timestamptz,
    FOREIGN KEY (recipient_id, org_id) REFERENCES org_members(id, org_id)
);
CREATE INDEX notifications_inbox_idx ON notifications (recipient_id, read_at, created_at DESC);

-- Users may mute email for anything except requests waiting on their decision.
CREATE TABLE notification_email_prefs (
    org_id      uuid NOT NULL,
    member_id   uuid NOT NULL,
    kind        text NOT NULL CHECK (kind <> 'request_needs_decision'),
    email_muted boolean NOT NULL DEFAULT true,
    PRIMARY KEY (member_id, kind),
    FOREIGN KEY (member_id, org_id) REFERENCES org_members(id, org_id)
);

-- =====================================================================
-- 12. Helper functions
-- =====================================================================
CREATE FUNCTION member_role_of(p_member uuid) RETURNS member_role
LANGUAGE sql STABLE AS
$$ SELECT role FROM org_members WHERE id = p_member AND status = 'active' $$;

CREATE FUNCTION is_ceo_or_coo(p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT coalesce(member_role_of(p_member) IN ('ceo', 'coo'), false) $$;

CREATE FUNCTION is_project_member(p_project uuid, p_member uuid, p_role project_role DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM project_members
                   WHERE project_id = p_project AND member_id = p_member
                     AND removed_at IS NULL AND (p_role IS NULL OR role = p_role)) $$;

CREATE FUNCTION is_project_lead(p_project uuid, p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM project_members
                   WHERE project_id = p_project AND member_id = p_member
                     AND removed_at IS NULL AND is_lead) $$;

CREATE FUNCTION is_lead_anywhere(p_member uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM project_members pm JOIN projects p ON p.id = pm.project_id
                   WHERE pm.member_id = p_member AND pm.removed_at IS NULL AND pm.is_lead
                     AND p.status IN ('active', 'pending_lead_approval')) $$;

CREATE FUNCTION is_task_assignee(p_task uuid, p_member uuid, p_role project_role DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM task_assignees
                   WHERE task_id = p_task AND member_id = p_member
                     AND removed_at IS NULL AND (p_role IS NULL OR role = p_role)) $$;

CREATE FUNCTION is_weekend_or_holiday(p_org uuid, p_day date) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT extract(isodow FROM p_day)::smallint = ANY (s.weekend_days)
          OR EXISTS (SELECT 1 FROM org_holidays h WHERE h.org_id = p_org AND h.holiday_date = p_day)
     FROM org_settings s WHERE s.org_id = p_org $$;

-- End of the Nth working day after p_from, in the org's time zone.
-- Used for the 3-working-day request expiry (§3).
CREATE FUNCTION add_working_days(p_org uuid, p_from timestamptz, p_days integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_tz   text;
    v_day  date;
    v_left integer := p_days;
BEGIN
    SELECT timezone INTO v_tz FROM org_settings WHERE org_id = p_org;
    v_tz  := coalesce(v_tz, 'UTC');
    v_day := (p_from AT TIME ZONE v_tz)::date;
    WHILE v_left > 0 LOOP
        v_day := v_day + 1;
        IF NOT coalesce(is_weekend_or_holiday(p_org, v_day), false) THEN
            v_left := v_left - 1;
        END IF;
    END LOOP;
    RETURN ((v_day + 1)::timestamp AT TIME ZONE v_tz) - interval '1 microsecond';
END $$;

-- Seats in use: active managers + employees, plus create_user requests that
-- are still pending or approved-but-not-applied (they reserve a seat).
CREATE FUNCTION org_seats_used(p_org uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT (SELECT count(*) FROM org_members
             WHERE org_id = p_org AND role IN ('manager', 'employee') AND status = 'active')::integer
         + (SELECT count(*) FROM requests
             WHERE org_id = p_org AND type = 'create_user' AND status IN ('pending', 'approved'))::integer
$$;

-- =====================================================================
-- 13. Triggers enforcing the plan's rules
-- =====================================================================

-- ---- generic: updated_at -------------------------------------------
CREATE FUNCTION trg_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER touch BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON orgs            FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON org_settings    FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON org_members     FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON projects        FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON tasks           FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER touch BEFORE UPDATE ON attendance_days FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

-- ---- gameMasters: never remove the last active one ----------------
CREATE FUNCTION trg_gm_keep_last() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'gameMasters are never deleted; set status = removed';
    END IF;
    IF OLD.status = 'active' AND NEW.status <> 'active'
       AND NOT EXISTS (SELECT 1 FROM game_masters WHERE status = 'active' AND user_id <> OLD.user_id) THEN
        RAISE EXCEPTION 'Cannot remove the last active gameMaster';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER gm_keep_last BEFORE UPDATE OR DELETE ON game_masters
    FOR EACH ROW EXECUTE FUNCTION trg_gm_keep_last();

CREATE FUNCTION trg_gm_confirmer_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.confirmed_by IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM game_masters WHERE user_id = NEW.confirmed_by AND status = 'active') THEN
        RAISE EXCEPTION 'Confirmation must come from another active gameMaster';
    END IF;
    IF NEW.status = 'active' AND NEW.confirmed_by IS NOT NULL AND NEW.confirmed_at IS NULL THEN
        NEW.confirmed_at := now();
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER gm_confirmer_active BEFORE INSERT OR UPDATE ON game_masters
    FOR EACH ROW EXECUTE FUNCTION trg_gm_confirmer_active();

-- ---- orgs: settings + default leave types on creation; downgrade guard
CREATE FUNCTION trg_org_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO org_settings (org_id) VALUES (NEW.id);
    INSERT INTO leave_types (org_id, code, name, yearly_allowance_days, is_paid) VALUES
        (NEW.id, 'annual', 'Annual', 15, true),
        (NEW.id, 'sick',   'Sick',    7, true),
        (NEW.id, 'casual', 'Casual',  7, true),
        (NEW.id, 'unpaid', 'Unpaid',  7, false);
    RETURN NEW;
END $$;
CREATE TRIGGER org_bootstrap AFTER INSERT ON orgs FOR EACH ROW EXECUTE FUNCTION trg_org_bootstrap();

CREATE FUNCTION trg_org_plan_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit integer;
BEGIN
    IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
        SELECT seat_limit INTO v_limit FROM plans WHERE code = NEW.plan_code;
        IF org_seats_used(NEW.id) > v_limit THEN
            RAISE EXCEPTION 'Downgrade blocked: % seats in use, new plan allows %. Suspend accounts first.',
                org_seats_used(NEW.id), v_limit USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER org_plan_change BEFORE UPDATE OF plan_code ON orgs
    FOR EACH ROW EXECUTE FUNCTION trg_org_plan_change();

-- ---- seat limit (checked at commit, serialised per org) ------------
CREATE FUNCTION trg_seat_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit integer; v_used integer;
BEGIN
    PERFORM 1 FROM orgs WHERE id = NEW.org_id FOR UPDATE;   -- serialise concurrent seat grabs
    SELECT p.seat_limit INTO v_limit FROM orgs o JOIN plans p ON p.code = o.plan_code WHERE o.id = NEW.org_id;
    v_used := org_seats_used(NEW.org_id);
    IF v_used > v_limit THEN
        RAISE EXCEPTION 'Seat limit reached (% of %). The request was refused.', v_used, v_limit
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER seat_limit_members AFTER INSERT OR UPDATE OF role, status ON org_members
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.role IN ('manager', 'employee') AND NEW.status = 'active')
    EXECUTE FUNCTION trg_seat_limit();
CREATE CONSTRAINT TRIGGER seat_limit_requests AFTER INSERT ON requests
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.type = 'create_user')
    EXECUTE FUNCTION trg_seat_limit();

-- ---- every org keeps at least one active CEO (checked at commit) ---
CREATE FUNCTION trg_keep_one_ceo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_org uuid := CASE WHEN TG_TABLE_NAME = 'orgs' THEN (to_jsonb(NEW) ->> 'id')::uuid
                           ELSE (to_jsonb(NEW) ->> 'org_id')::uuid END;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_org AND role = 'ceo' AND status = 'active') THEN
        RAISE EXCEPTION 'An org must always have at least one active CEO. Removing the last CEO goes through the gameMaster.';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER keep_one_ceo_members AFTER UPDATE OF role, status ON org_members
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.role = 'ceo' AND OLD.status = 'active')
    EXECUTE FUNCTION trg_keep_one_ceo();
CREATE CONSTRAINT TRIGGER keep_one_ceo_new_org AFTER INSERT ON orgs
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_keep_one_ceo();

-- ---- org_members: who may create / change members -------------------
CREATE FUNCTION trg_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid := current_member_id(); v_actor_role member_role;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Members are never deleted; deactivate instead';
    END IF;
    IF is_system() THEN RETURN NEW; END IF;
    v_actor_role := member_role_of(v_actor);

    IF TG_OP = 'INSERT' THEN
        -- Only CEO/COO create accounts; a manager's create_user request is applied by the approving CEO/COO.
        IF v_actor_role NOT IN ('ceo', 'coo') THEN
            RAISE EXCEPTION 'Only a CEO or COO can create users';
        END IF;
        IF NEW.role IN ('ceo', 'coo') AND v_actor_role <> 'ceo' THEN
            RAISE EXCEPTION 'Only a CEO can add CEOs and COOs';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.task_approval_required IS DISTINCT FROM OLD.task_approval_required
       OR NEW.can_view_all_projects  IS DISTINCT FROM OLD.can_view_all_projects
       OR NEW.status IS DISTINCT FROM OLD.status THEN
        IF v_actor_role NOT IN ('ceo', 'coo') THEN
            RAISE EXCEPTION 'Only a CEO or COO can change roles, status or approval switches';
        END IF;
        IF (OLD.role IN ('ceo', 'coo') OR NEW.role IN ('ceo', 'coo')) AND v_actor_role <> 'ceo' THEN
            RAISE EXCEPTION 'Only a CEO can change CEO/COO accounts';
        END IF;
    ELSIF v_actor <> NEW.id THEN
        -- profile fields: CEO/COO, or a manager sharing a project with this person
        IF v_actor_role NOT IN ('ceo', 'coo') AND NOT (
             v_actor_role = 'manager' AND OLD.role = 'employee' AND EXISTS (
               SELECT 1 FROM project_members a JOIN project_members b ON a.project_id = b.project_id
                WHERE a.member_id = v_actor AND a.role = 'manager' AND a.removed_at IS NULL
                  AND b.member_id = NEW.id AND b.removed_at IS NULL)) THEN
            RAISE EXCEPTION 'Not allowed to edit this profile';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER member_guard BEFORE INSERT OR UPDATE OR DELETE ON org_members
    FOR EACH ROW EXECUTE FUNCTION trg_member_guard();

-- Side effects of suspension, deactivation and role changes (§8).
CREATE FUNCTION trg_member_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid := current_member_id();
BEGIN
    IF NEW.status <> 'active' AND OLD.status = 'active' THEN
        -- leaves every project, every open task; lead tags dropped; pending requests cancelled
        UPDATE task_assignees ta SET removed_at = now(), removed_by = v_actor
          FROM tasks t
         WHERE ta.task_id = t.id AND ta.member_id = NEW.id AND ta.removed_at IS NULL
           AND t.status NOT IN ('done', 'cancelled');
        UPDATE project_members SET removed_at = now(), removed_by = v_actor, is_lead = false
         WHERE member_id = NEW.id AND removed_at IS NULL;
        UPDATE requests SET status = 'cancelled', decision_reason = 'Requester is no longer active'
         WHERE requested_by = NEW.id AND status = 'pending';
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
        UPDATE requests SET status = 'cancelled', decision_reason = 'Requester role changed'
         WHERE requested_by = NEW.id AND status = 'pending';
        IF NEW.role IN ('manager', 'employee') AND OLD.role IN ('manager', 'employee') THEN
            -- demoted/promoted: keeps projects and tasks under the new role
            UPDATE project_members SET role = NEW.role::text::project_role, is_lead = false
             WHERE member_id = NEW.id AND removed_at IS NULL;
            UPDATE task_assignees SET role = NEW.role::text::project_role
             WHERE member_id = NEW.id AND removed_at IS NULL;
        ELSE
            -- became CEO/COO (they are never project members) or vice versa
            UPDATE task_assignees SET removed_at = now(), removed_by = v_actor
             WHERE member_id = NEW.id AND removed_at IS NULL;
            UPDATE project_members SET removed_at = now(), removed_by = v_actor, is_lead = false
             WHERE member_id = NEW.id AND removed_at IS NULL;
        END IF;
        IF NEW.role <> 'manager' THEN
            NEW.task_approval_required := false;
            NEW.can_view_all_projects  := false;
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER member_lifecycle BEFORE UPDATE OF status, role ON org_members
    FOR EACH ROW EXECUTE FUNCTION trg_member_lifecycle();

-- ---- projects --------------------------------------------------------
CREATE FUNCTION trg_project_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_actor uuid := current_member_id();
    v_role  member_role;
    v_open  integer;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Projects are never deleted; archive instead (CEO only)';
    END IF;
    v_role := member_role_of(v_actor);

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'active' THEN RAISE EXCEPTION 'New projects start as active'; END IF;
        IF NOT is_system() AND v_role <> 'ceo' THEN
            -- COO projects are created when the CEO approves and applies the COO's request
            RAISE EXCEPTION 'Only a CEO creates projects (a COO needs CEO approval)';
        END IF;
        IF member_role_of(NEW.created_by) = 'coo' AND NOT EXISTS (
             SELECT 1 FROM requests r WHERE r.id = NEW.created_via_request AND r.type = 'create_project'
                AND r.requested_by = NEW.created_by AND r.status = 'approved') THEN
            RAISE EXCEPTION 'A COO project needs an approved create_project request';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        -- plain edits: CEO/COO or a lead of the project
        IF NOT is_system() AND NOT is_ceo_or_coo(v_actor) AND NOT is_project_lead(NEW.id, v_actor) THEN
            RAISE EXCEPTION 'Only the CEO, COO or a project lead can edit a project';
        END IF;
        IF OLD.status = 'archived' THEN RAISE EXCEPTION 'Archived projects are read-only'; END IF;
        RETURN NEW;
    END IF;

    -- status transitions
    IF NEW.status = 'archived' THEN
        IF NOT is_system() AND v_role <> 'ceo' THEN RAISE EXCEPTION 'Only a CEO can archive a project'; END IF;
        NEW.archived_at := now();
        NEW.archived_by := coalesce(NEW.archived_by, v_actor);
        RETURN NEW;
    END IF;
    IF OLD.status = 'archived' THEN RAISE EXCEPTION 'Archived projects cannot change status'; END IF;

    IF OLD.status = 'active' AND NEW.status = 'pending_lead_approval' THEN
        IF NOT is_system() THEN
            RAISE EXCEPTION 'A project moves to lead approval automatically once every manager has ticked it';
        END IF;
        NEW.completion_requested_at := now();
    ELSIF OLD.status = 'pending_lead_approval' AND NEW.status = 'completed' THEN
        IF EXISTS (SELECT 1 FROM project_members WHERE project_id = NEW.id AND removed_at IS NULL AND is_lead) THEN
            IF NOT is_system() AND NOT is_project_lead(NEW.id, v_actor) THEN
                RAISE EXCEPTION 'Completion must be approved by a project lead';
            END IF;
        ELSIF NOT is_system() AND NOT is_ceo_or_coo(v_actor) THEN
            RAISE EXCEPTION 'This project has no lead, so the CEO or COO approves completion';
        END IF;
        SELECT count(*) INTO v_open FROM tasks WHERE project_id = NEW.id AND status NOT IN ('done', 'cancelled');
        IF v_open > 0 THEN RAISE EXCEPTION 'Project still has % open task(s)', v_open; END IF;
        NEW.completed_at           := now();
        NEW.completion_approved_by := coalesce(v_actor, NEW.completion_approved_by);
        NEW.rating_closes_at       := now() + make_interval(days =>
            (SELECT rating_window_days FROM org_settings WHERE org_id = NEW.org_id));
    ELSIF OLD.status = 'pending_lead_approval' AND NEW.status = 'active' THEN
        -- lead (or CEO/COO) sends it back; ticks are cleared
        IF NOT is_system() AND NOT is_project_lead(NEW.id, v_actor) AND NOT is_ceo_or_coo(v_actor) THEN
            RAISE EXCEPTION 'Only a project lead, CEO or COO can send a project back';
        END IF;
        NEW.completion_requested_at := NULL;
        DELETE FROM project_completion_ticks WHERE project_id = NEW.id;
    ELSIF OLD.status = 'completed' AND NEW.status = 'active' THEN
        IF NOT is_system() AND NOT is_ceo_or_coo(v_actor) THEN
            RAISE EXCEPTION 'Only the CEO or COO can reopen a completed project';
        END IF;
        NEW.completion_requested_at := NULL;
        NEW.completed_at            := NULL;
        NEW.completion_approved_by  := NULL;
        NEW.rating_closes_at        := NULL;
        DELETE FROM project_completion_ticks WHERE project_id = NEW.id;
    ELSE
        RAISE EXCEPTION 'Invalid project status change % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER project_guard BEFORE INSERT OR UPDATE OR DELETE ON projects
    FOR EACH ROW EXECUTE FUNCTION trg_project_guard();

-- Archiving auto-cancels open tasks (§3).
CREATE FUNCTION trg_project_archived() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE tasks SET status = 'cancelled', cancel_reason = 'Project archived',
                     status_comment = 'Project archived'
     WHERE project_id = NEW.id AND status NOT IN ('done', 'cancelled');
    RETURN NULL;
END $$;
CREATE TRIGGER project_archived AFTER UPDATE OF status ON projects
    FOR EACH ROW WHEN (NEW.status = 'archived' AND OLD.status <> 'archived')
    EXECUTE FUNCTION trg_project_archived();

-- ---- project_members --------------------------------------------------
CREATE FUNCTION trg_project_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_actor uuid := current_member_id();
    v_mrole member_role;
    v_pstat project_status;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Set removed_at instead of deleting'; END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT role INTO v_mrole FROM org_members WHERE id = NEW.member_id AND status = 'active';
        IF v_mrole IS NULL OR v_mrole::text <> NEW.role::text THEN
            RAISE EXCEPTION 'Project role must match the member''s org role (managers as manager, employees as employee)';
        END IF;
        SELECT status INTO v_pstat FROM projects WHERE id = NEW.project_id;
        IF v_pstat NOT IN ('active', 'pending_lead_approval') THEN
            RAISE EXCEPTION 'Cannot add members to a % project', v_pstat;
        END IF;
        IF NEW.is_lead AND NOT is_system() AND NOT is_ceo_or_coo(v_actor) THEN
            RAISE EXCEPTION 'Only the CEO or COO can tag a project lead';
        END IF;
        IF NOT is_system() AND NOT is_ceo_or_coo(v_actor) THEN
            -- everyone else joins through an accepted or overruled invite
            IF NOT EXISTS (SELECT 1 FROM project_invites i
                            WHERE i.id = NEW.added_via_invite AND i.project_id = NEW.project_id
                              AND i.invitee_member_id = NEW.member_id AND i.status IN ('accepted', 'overruled')) THEN
                RAISE EXCEPTION 'Managers cannot add people directly; use an approved request and invite';
            END IF;
        END IF;
        NEW.added_by := coalesce(NEW.added_by, v_actor);
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.is_lead IS DISTINCT FROM OLD.is_lead AND NEW.removed_at IS NULL THEN
        IF NOT is_system() AND NOT is_ceo_or_coo(v_actor) THEN
            RAISE EXCEPTION 'Only the CEO or COO can tag or untag a project lead';
        END IF;
        NEW.lead_tagged_by := CASE WHEN NEW.is_lead THEN coalesce(v_actor, NEW.lead_tagged_by) END;
    END IF;
    IF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
        IF NOT is_system() AND NOT is_ceo_or_coo(v_actor) AND NOT is_project_lead(NEW.project_id, v_actor) THEN
            RAISE EXCEPTION 'Only the CEO, COO or a project lead can remove someone from a project';
        END IF;
        NEW.is_lead := false;
        NEW.lead_tagged_by := NULL;
        NEW.removed_by := coalesce(NEW.removed_by, v_actor);
    END IF;
    IF OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
        RAISE EXCEPTION 'Re-add the person as a new membership instead of restoring an old one';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER project_member_guard BEFORE INSERT OR UPDATE OR DELETE ON project_members
    FOR EACH ROW EXECUTE FUNCTION trg_project_member_guard();

-- Removal side effects (§8): unassign from this project's open tasks,
-- cancel their pending requests on this project, drop their completion tick.
CREATE FUNCTION trg_project_member_removed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE task_assignees ta SET removed_at = now(), removed_by = NEW.removed_by
      FROM tasks t
     WHERE ta.task_id = t.id AND t.project_id = NEW.project_id AND ta.member_id = NEW.member_id
       AND ta.removed_at IS NULL AND t.status NOT IN ('done', 'cancelled');
    UPDATE requests SET status = 'cancelled', decision_reason = 'Requester was removed from the project'
     WHERE requested_by = NEW.member_id AND project_id = NEW.project_id AND status = 'pending';
    DELETE FROM project_completion_ticks WHERE project_id = NEW.project_id AND member_id = NEW.member_id;
    RETURN NULL;
END $$;
CREATE TRIGGER project_member_removed AFTER UPDATE OF removed_at ON project_members
    FOR EACH ROW WHEN (OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL)
    EXECUTE FUNCTION trg_project_member_removed();

-- ---- project completion ticks (§5) ----------------------------------
CREATE FUNCTION trg_completion_tick() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status project_status; v_managers integer; v_ticks integer;
BEGIN
    SELECT status INTO v_status FROM projects WHERE id = NEW.project_id FOR UPDATE;
    IF v_status <> 'active' THEN RAISE EXCEPTION 'Project is not active'; END IF;
    IF NOT is_system() AND NEW.member_id <> current_member_id() THEN
        RAISE EXCEPTION 'Managers tick for themselves only';
    END IF;
    IF NOT is_project_member(NEW.project_id, NEW.member_id, 'manager') THEN
        RAISE EXCEPTION 'Only managers on the project can tick it as done';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE project_id = NEW.project_id AND status = 'done') THEN
        RAISE EXCEPTION 'Project has no completed tasks';
    END IF;
    IF EXISTS (SELECT 1 FROM tasks WHERE project_id = NEW.project_id AND status NOT IN ('done', 'cancelled')) THEN
        RAISE EXCEPTION 'Every task must be Done or Cancelled before ticking the project';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER completion_tick BEFORE INSERT ON project_completion_ticks
    FOR EACH ROW EXECUTE FUNCTION trg_completion_tick();

CREATE FUNCTION trg_completion_all_ticked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_managers integer; v_ticks integer;
BEGIN
    SELECT count(*) INTO v_managers FROM project_members
     WHERE project_id = NEW.project_id AND role = 'manager' AND removed_at IS NULL;
    SELECT count(*) INTO v_ticks FROM project_completion_ticks c
      JOIN project_members pm ON pm.project_id = c.project_id AND pm.member_id = c.member_id AND pm.removed_at IS NULL
     WHERE c.project_id = NEW.project_id;
    IF v_ticks >= v_managers THEN
        PERFORM set_config('app.member_id', '', true);           -- system transition
        UPDATE projects SET status = 'pending_lead_approval' WHERE id = NEW.project_id;
        PERFORM set_config('app.member_id', NEW.member_id::text, true);
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER completion_all_ticked AFTER INSERT ON project_completion_ticks
    FOR EACH ROW EXECUTE FUNCTION trg_completion_all_ticked();

-- ---- tasks -------------------------------------------------------------
CREATE FUNCTION trg_task_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_actor  uuid := current_member_id();
    v_role   member_role := member_role_of(current_member_id());
    v_pstat  project_status;
BEGIN
    SELECT status INTO v_pstat FROM projects WHERE id = NEW.project_id FOR UPDATE;
    IF v_pstat IN ('completed', 'archived') THEN
        RAISE EXCEPTION 'Cannot add tasks to a % project', v_pstat;
    END IF;
    IF NEW.status <> 'todo' THEN RAISE EXCEPTION 'New tasks start in To do'; END IF;

    IF NOT is_system() THEN
        IF v_role = 'employee' OR v_role IS NULL THEN
            RAISE EXCEPTION 'Employees cannot create tasks';
        ELSIF v_role = 'manager' THEN
            IF NOT is_project_member(NEW.project_id, v_actor, 'manager') THEN
                RAISE EXCEPTION 'Managers create tasks only in projects they are on';
            END IF;
            IF (SELECT task_approval_required FROM org_members WHERE id = v_actor) AND NOT EXISTS (
                 SELECT 1 FROM requests r WHERE r.id = NEW.created_via_request AND r.type = 'create_task'
                    AND r.requested_by = v_actor AND r.project_id = NEW.project_id AND r.status = 'approved') THEN
                RAISE EXCEPTION 'This manager needs an approved create_task request';
            END IF;
        END IF;
        NEW.created_by := v_actor;
    END IF;

    -- a new task resets every manager's completion tick (§5)
    DELETE FROM project_completion_ticks WHERE project_id = NEW.project_id;
    IF v_pstat = 'pending_lead_approval' THEN
        PERFORM set_config('app.member_id', '', true);
        UPDATE projects SET status = 'active' WHERE id = NEW.project_id;
        PERFORM set_config('app.member_id', coalesce(v_actor::text, ''), true);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER task_insert_guard BEFORE INSERT ON tasks
    FOR EACH ROW EXECUTE FUNCTION trg_task_insert_guard();

-- Status workflow (§5):
--   todo -> in_progress | blocked | cancelled
--   in_progress -> in_review | blocked | cancelled
--   in_review -> done | in_progress (sent back, comment) | blocked | cancelled
--   blocked -> in_progress | cancelled
--   done -> in_progress (reopen, comment)
CREATE FUNCTION trg_task_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_actor   uuid := current_member_id();
    v_ceo_coo boolean := is_ceo_or_coo(current_member_id());
    v_mgr_on  boolean := is_task_assignee(NEW.id, current_member_id(), 'manager');
    v_any_on  boolean := is_task_assignee(NEW.id, current_member_id());
    v_ok      boolean;
BEGIN
    IF NEW.project_id <> OLD.project_id THEN RAISE EXCEPTION 'Tasks cannot move between projects'; END IF;

    IF NEW.status = OLD.status THEN
        -- content edits: CEO/COO or a manager on the project
        IF NOT is_system() AND NOT v_ceo_coo AND NOT is_project_member(NEW.project_id, v_actor, 'manager') THEN
            RAISE EXCEPTION 'Only managers on the project, the CEO or COO can edit tasks';
        END IF;
        IF OLD.status IN ('done', 'cancelled') AND (NEW.title, NEW.due_at, NEW.urgency) IS DISTINCT FROM (OLD.title, OLD.due_at, OLD.urgency) THEN
            RAISE EXCEPTION 'Reopen the task before editing it';
        END IF;
        RETURN NEW;
    END IF;

    v_ok := CASE OLD.status
        WHEN 'todo'        THEN NEW.status IN ('in_progress', 'blocked', 'cancelled')
        WHEN 'in_progress' THEN NEW.status IN ('in_review', 'blocked', 'cancelled')
        WHEN 'in_review'   THEN NEW.status IN ('done', 'in_progress', 'blocked', 'cancelled')
        WHEN 'blocked'     THEN NEW.status IN ('in_progress', 'cancelled')
        WHEN 'done'        THEN NEW.status = 'in_progress'
        ELSE false END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Invalid task status change % -> %', OLD.status, NEW.status;
    END IF;

    IF NOT is_system() THEN
        IF NEW.status IN ('in_progress', 'in_review') AND OLD.status IN ('todo', 'in_progress', 'blocked') THEN
            IF NOT (v_any_on OR v_ceo_coo) THEN RAISE EXCEPTION 'Only people on the task can move it forward'; END IF;
        ELSIF NEW.status = 'blocked' THEN
            IF NOT (v_any_on OR v_ceo_coo) THEN RAISE EXCEPTION 'Only people on the task can block it'; END IF;
        ELSIF NEW.status IN ('done', 'cancelled') OR OLD.status IN ('in_review', 'done') THEN
            IF NOT (v_mgr_on OR v_ceo_coo) THEN
                RAISE EXCEPTION 'Only a manager on the task, the CEO or COO can do this';
            END IF;
        END IF;
    END IF;

    -- leaving To do needs at least one manager and one employee (§5)
    IF OLD.status = 'todo' AND NEW.status IN ('in_progress', 'blocked') THEN
        IF NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = NEW.id AND role = 'manager'  AND removed_at IS NULL) OR
           NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = NEW.id AND role = 'employee' AND removed_at IS NULL) THEN
            RAISE EXCEPTION 'A task needs at least one manager and one employee before work starts';
        END IF;
    END IF;

    -- comments required when sending back or reopening
    IF (OLD.status = 'in_review' AND NEW.status = 'in_progress') OR OLD.status = 'done' THEN
        IF NEW.status_comment IS NULL OR NEW.status_comment IS NOT DISTINCT FROM OLD.status_comment THEN
            RAISE EXCEPTION 'A comment is required to send back or reopen a task';
        END IF;
    END IF;

    IF NEW.status <> 'blocked'   THEN NEW.blocked_reason := NULL; END IF;
    IF NEW.status <> 'cancelled' THEN NEW.cancel_reason  := NULL; END IF;
    NEW.completed_at := CASE WHEN NEW.status = 'done' THEN now() END;
    RETURN NEW;
END $$;
CREATE TRIGGER task_update_guard BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION trg_task_update_guard();

CREATE FUNCTION trg_task_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO task_status_history (org_id, task_id, from_status, to_status, comment, changed_by)
    VALUES (NEW.org_id, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
            coalesce(NEW.blocked_reason, NEW.cancel_reason, NEW.status_comment), current_member_id());
    RETURN NULL;
END $$;
CREATE TRIGGER task_history_ins AFTER INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION trg_task_history();
CREATE TRIGGER task_history_upd AFTER UPDATE OF status ON tasks
    FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status) EXECUTE FUNCTION trg_task_history();

CREATE FUNCTION trg_task_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tasks are never deleted; cancel them instead'; END $$;
CREATE TRIGGER task_no_delete BEFORE DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION trg_task_no_delete();

-- ---- task assignees --------------------------------------------------
CREATE FUNCTION trg_task_assignee_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_actor uuid := current_member_id();
    v_role  member_role := member_role_of(current_member_id());
    v_task  tasks%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Set removed_at instead of deleting'; END IF;
    SELECT * INTO v_task FROM tasks WHERE id = NEW.task_id;

    IF TG_OP = 'INSERT' THEN
        IF v_task.status IN ('done', 'cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;
        -- the assignee must already be on the project, in the same role (§3)
        IF NOT is_project_member(v_task.project_id, NEW.member_id, NEW.role) THEN
            RAISE EXCEPTION 'Assignee is not on this project as %; use an add_and_assign request', NEW.role;
        END IF;
        IF NOT is_system() THEN
            IF v_role NOT IN ('ceo', 'coo', 'manager') OR v_role IS NULL THEN
                RAISE EXCEPTION 'Employees cannot assign tasks';
            END IF;
            IF v_role = 'manager' THEN
                IF NOT is_project_member(v_task.project_id, v_actor, 'manager') THEN
                    RAISE EXCEPTION 'Managers assign only within their own projects';
                END IF;
                IF (SELECT task_approval_required FROM org_members WHERE id = v_actor)
                   AND NOT (NEW.member_id = v_actor) AND NOT EXISTS (
                     SELECT 1 FROM requests r WHERE r.id = NEW.assigned_via_request
                        AND r.type IN ('assign_task', 'add_and_assign') AND r.task_id = NEW.task_id
                        AND r.subject_member_id = NEW.member_id AND r.status = 'approved') THEN
                    RAISE EXCEPTION 'This manager needs an approved assign_task request';
                END IF;
            END IF;
        END IF;
        NEW.assigned_by := coalesce(NEW.assigned_by, v_actor);
        RETURN NEW;
    END IF;

    IF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
        NEW.removed_by := coalesce(NEW.removed_by, v_actor);
    ELSIF (NEW.member_id, NEW.task_id) IS DISTINCT FROM (OLD.member_id, OLD.task_id) THEN
        RAISE EXCEPTION 'Assignments are not edited; remove and re-add';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER task_assignee_guard BEFORE INSERT OR UPDATE OR DELETE ON task_assignees
    FOR EACH ROW EXECUTE FUNCTION trg_task_assignee_guard();

-- ---- requests ----------------------------------------------------------
CREATE FUNCTION trg_request_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_role member_role := member_role_of(NEW.requested_by);
BEGIN
    IF NOT is_system() AND NEW.requested_by <> current_member_id() THEN
        RAISE EXCEPTION 'Requests are made by the signed-in member only';
    END IF;
    IF v_role IS NULL THEN RAISE EXCEPTION 'Requester is not active'; END IF;
    NEW.status := 'pending';
    NEW.expires_at := add_working_days(NEW.org_id, now(),
        (SELECT request_expiry_working_days FROM org_settings WHERE org_id = NEW.org_id));

    IF NEW.type = 'create_user' AND v_role <> 'manager' THEN
        RAISE EXCEPTION 'CEO/COO create users directly; only managers request it';
    ELSIF NEW.type = 'create_project' AND v_role <> 'coo' THEN
        RAISE EXCEPTION 'Only a COO requests a project (a CEO creates it directly)';
    ELSIF NEW.type IN ('add_to_project', 'create_task', 'assign_task', 'add_and_assign') THEN
        IF v_role <> 'manager' OR NOT is_project_member(NEW.project_id, NEW.requested_by, 'manager') THEN
            RAISE EXCEPTION 'Only a manager on the project can make this request';
        END IF;
    ELSIF NEW.type IN ('leave', 'leave_change', 'attendance_correction') AND v_role NOT IN ('manager', 'employee', 'coo', 'ceo') THEN
        RAISE EXCEPTION 'Invalid requester';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER request_insert BEFORE INSERT ON requests FOR EACH ROW EXECUTE FUNCTION trg_request_insert();

-- Who may decide a request (§3, §12). Returns NULL when allowed, else a reason.
CREATE FUNCTION request_decider_error(r requests, p_decider uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE v_role member_role := member_role_of(p_decider);
BEGIN
    IF v_role IS NULL THEN RETURN 'Decider is not an active member'; END IF;
    IF p_decider = r.requested_by AND v_role <> 'ceo' THEN
        RETURN 'Nobody approves their own request, except a CEO';
    END IF;
    CASE r.type
        WHEN 'create_user' THEN
            IF v_role NOT IN ('ceo', 'coo') THEN RETURN 'Only a CEO or COO approves new accounts'; END IF;
        WHEN 'create_project' THEN
            IF v_role <> 'ceo' THEN RETURN 'Only a CEO approves a COO''s project'; END IF;
        WHEN 'add_to_project', 'create_task', 'assign_task', 'add_and_assign' THEN
            IF v_role NOT IN ('ceo', 'coo') AND NOT is_project_lead(r.project_id, p_decider) THEN
                RETURN 'Only a lead of this project, the CEO or COO can decide this';
            END IF;
        WHEN 'leave', 'leave_change', 'attendance_correction' THEN
            IF v_role IN ('ceo', 'coo') THEN RETURN NULL; END IF;
            IF is_lead_anywhere(r.requested_by) OR member_role_of(r.requested_by) IN ('ceo', 'coo') THEN
                RETURN 'Requests from a project lead (or CEO/COO) go to the COO';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM project_members a JOIN project_members b ON a.project_id = b.project_id
                             JOIN projects p ON p.id = a.project_id
                            WHERE a.member_id = p_decider AND a.is_lead AND a.removed_at IS NULL
                              AND b.member_id = r.requested_by AND b.removed_at IS NULL
                              AND p.status IN ('active', 'pending_lead_approval')) THEN
                RETURN 'Only a lead on one of the requester''s active projects, or the COO, can decide this';
            END IF;
    END CASE;
    RETURN NULL;
END $$;

CREATE FUNCTION trg_request_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_err text; v_decider uuid;
BEGIN
    IF NEW.status = OLD.status THEN
        IF (NEW.type, NEW.requested_by, NEW.project_id, NEW.subject_member_id, NEW.task_id, NEW.payload)
           IS DISTINCT FROM (OLD.type, OLD.requested_by, OLD.project_id, OLD.subject_member_id, OLD.task_id, OLD.payload) THEN
            RAISE EXCEPTION 'Requests cannot be edited after they are made';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'pending'  AND NEW.status IN ('approved', 'rejected', 'cancelled', 'expired')) OR
        (OLD.status = 'approved' AND NEW.status IN ('applied', 'cancelled'))) THEN
        RAISE EXCEPTION 'Invalid request status change % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status IN ('approved', 'rejected') THEN
        v_decider := coalesce(current_member_id(), NEW.decided_by);
        v_err := request_decider_error(NEW, v_decider);
        IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
        IF OLD.expires_at < now() THEN RAISE EXCEPTION 'Request has expired'; END IF;
        NEW.decided_by := v_decider;
        NEW.decided_at := now();
    END IF;

    -- re-check the facts at approval time (§3)
    IF NEW.status = 'approved' THEN
        IF member_role_of(NEW.requested_by) IS NULL THEN
            RAISE EXCEPTION 'Requester is no longer active';
        END IF;
        IF NEW.type IN ('add_to_project', 'create_task', 'assign_task', 'add_and_assign')
           AND NOT is_project_member(NEW.project_id, NEW.requested_by, 'manager') THEN
            RAISE EXCEPTION 'Requester is no longer a manager on this project';
        END IF;
        IF NEW.subject_member_id IS NOT NULL AND member_role_of(NEW.subject_member_id) IS NULL THEN
            RAISE EXCEPTION 'The person this request is about is no longer active';
        END IF;
        IF NEW.type = 'assign_task' AND NOT EXISTS (
             SELECT 1 FROM project_members pm JOIN tasks t ON t.project_id = pm.project_id
              WHERE t.id = NEW.task_id AND pm.member_id = NEW.subject_member_id AND pm.removed_at IS NULL) THEN
            RAISE EXCEPTION 'The person is no longer on the project';
        END IF;
        IF NEW.project_id IS NOT NULL AND
           (SELECT status FROM projects WHERE id = NEW.project_id) NOT IN ('active', 'pending_lead_approval') THEN
            RAISE EXCEPTION 'Project is no longer active';
        END IF;
        -- seat check for create_user happens through the seat_limit constraint trigger
    END IF;

    IF NEW.status = 'cancelled' AND OLD.status = 'pending' AND NOT is_system()
       AND current_member_id() <> NEW.requested_by THEN
        RAISE EXCEPTION 'Only the requester can withdraw a request';
    END IF;
    IF NEW.status = 'applied' THEN NEW.applied_at := now(); END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER request_transition BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION trg_request_transition();

CREATE FUNCTION trg_request_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Requests are never deleted'; END $$;
CREATE TRIGGER request_no_delete BEFORE DELETE ON requests FOR EACH ROW EXECUTE FUNCTION trg_request_no_delete();

-- ---- project invites (§4) ---------------------------------------------
CREATE FUNCTION trg_invite_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid := current_member_id();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status := 'pending';
        NEW.expires_at := add_working_days(NEW.org_id, now(),
            (SELECT request_expiry_working_days FROM org_settings WHERE org_id = NEW.org_id));
        IF member_role_of(NEW.invitee_member_id)::text IS DISTINCT FROM NEW.role::text THEN
            RAISE EXCEPTION 'Invite role must match the invitee''s org role';
        END IF;
        IF is_project_member(NEW.project_id, NEW.invitee_member_id) THEN
            RAISE EXCEPTION 'Already on the project';
        END IF;
        IF NOT is_system() THEN
            IF NEW.invited_by <> v_actor THEN RAISE EXCEPTION 'invited_by must be the signed-in member'; END IF;
            IF NOT is_ceo_or_coo(v_actor) AND NOT EXISTS (
                 SELECT 1 FROM requests r WHERE r.id = NEW.request_id AND r.status = 'approved'
                    AND r.type IN ('add_to_project', 'add_and_assign') AND r.project_id = NEW.project_id
                    AND r.subject_member_id = NEW.invitee_member_id AND r.requested_by = v_actor) THEN
                RAISE EXCEPTION 'A manager can invite only after their add-to-project request is approved';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
        IF NOT is_system() AND v_actor <> NEW.invitee_member_id THEN
            RAISE EXCEPTION 'Only the invited person can accept or decline';
        END IF;
        NEW.responded_at := now();
    ELSIF OLD.status = 'declined' AND NEW.status IN ('decline_accepted', 'overruled') THEN
        IF NOT is_system() AND v_actor <> NEW.invited_by THEN
            RAISE EXCEPTION 'Only the person who sent the invite reviews a decline';
        END IF;
        NEW.reviewed_at := now();
    ELSIF OLD.status IN ('pending', 'declined') AND NEW.status = 'expired' THEN
        IF NOT is_system() THEN RAISE EXCEPTION 'Invites expire automatically'; END IF;
    ELSE
        RAISE EXCEPTION 'Invalid invite status change % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER invite_guard BEFORE INSERT OR UPDATE ON project_invites
    FOR EACH ROW EXECUTE FUNCTION trg_invite_guard();

-- Accepted or overruled invite -> the person joins the project.
CREATE FUNCTION trg_invite_join() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO project_members (org_id, project_id, member_id, role, added_by, added_via_invite)
    VALUES (NEW.org_id, NEW.project_id, NEW.invitee_member_id, NEW.role, NEW.invited_by, NEW.id);
    IF NEW.request_id IS NOT NULL THEN
        UPDATE requests SET status = 'applied' WHERE id = NEW.request_id AND status = 'approved'
           AND type = 'add_to_project';
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER invite_join AFTER UPDATE OF status ON project_invites
    FOR EACH ROW WHEN (NEW.status IN ('accepted', 'overruled') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_invite_join();

-- ---- meetings (§6) -------------------------------------------------------
CREATE FUNCTION trg_meeting_creator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF member_role_of(NEW.created_by) NOT IN ('ceo', 'coo', 'manager') OR member_role_of(NEW.created_by) IS NULL THEN
        RAISE EXCEPTION 'Only the CEO, COO or managers create meetings';
    END IF;
    IF NOT is_system() AND NEW.created_by <> current_member_id() THEN
        RAISE EXCEPTION 'created_by must be the signed-in member';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER meeting_creator BEFORE INSERT ON meetings FOR EACH ROW EXECUTE FUNCTION trg_meeting_creator();

CREATE FUNCTION trg_meeting_has_invitee() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_meeting uuid := CASE WHEN TG_TABLE_NAME = 'meetings' THEN (to_jsonb(NEW) ->> 'id')::uuid
                               ELSE (to_jsonb(OLD) ->> 'meeting_id')::uuid END;
BEGIN
    IF EXISTS (SELECT 1 FROM meetings WHERE id = v_meeting AND cancelled_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM meeting_invitees WHERE meeting_id = v_meeting) THEN
        RAISE EXCEPTION 'A meeting needs at least one invitee';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER meeting_has_invitee AFTER INSERT ON meetings
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_meeting_has_invitee();
CREATE CONSTRAINT TRIGGER meeting_keeps_invitee AFTER DELETE ON meeting_invitees
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_meeting_has_invitee();

CREATE FUNCTION trg_meeting_invitee_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF member_role_of(NEW.member_id) IS NULL THEN RAISE EXCEPTION 'Invitee is not an active member'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER meeting_invitee_active BEFORE INSERT ON meeting_invitees
    FOR EACH ROW EXECUTE FUNCTION trg_meeting_invitee_active();

-- ---- leave (§12) ----------------------------------------------------------
CREATE FUNCTION trg_leave_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_req requests%ROWTYPE;
BEGIN
    SELECT * INTO v_req FROM requests WHERE id = NEW.request_id;
    IF TG_OP = 'INSERT' THEN
        IF v_req.type <> 'leave' OR v_req.requested_by <> NEW.member_id THEN
            RAISE EXCEPTION 'leave_requests must hang off the requester''s own leave request';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL THEN
        IF NEW.start_date <= current_date AND NOT is_system() THEN
            RAISE EXCEPTION 'Leave has started; changes need a leave_change request';
        END IF;
    ELSIF (NEW.start_date, NEW.end_date, NEW.leave_type_id, NEW.days) IS DISTINCT FROM
          (OLD.start_date, OLD.end_date, OLD.leave_type_id, OLD.days) AND NOT is_system() THEN
        RAISE EXCEPTION 'Leave details cannot be edited; cancel and request again';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER leave_request_guard BEFORE INSERT OR UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION trg_leave_request_guard();

-- No overlapping approved leave for the same person.
CREATE FUNCTION trg_leave_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lr leave_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_lr FROM leave_requests WHERE request_id = NEW.id;
    IF FOUND AND EXISTS (
        SELECT 1 FROM leave_requests o JOIN requests r ON r.id = o.request_id
         WHERE o.member_id = v_lr.member_id AND o.request_id <> v_lr.request_id
           AND r.status IN ('approved', 'applied') AND o.cancelled_at IS NULL
           AND daterange(o.start_date, o.end_date, '[]') && daterange(v_lr.start_date, v_lr.end_date, '[]')) THEN
        RAISE EXCEPTION 'Overlaps with leave already approved';
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER leave_no_overlap AFTER UPDATE OF status ON requests
    FOR EACH ROW WHEN (NEW.type = 'leave' AND NEW.status = 'approved')
    EXECUTE FUNCTION trg_leave_no_overlap();

-- ---- attendance (§12) ------------------------------------------------------
CREATE FUNCTION trg_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_s       org_settings%ROWTYPE;
    v_local   time;
    v_correct boolean := NEW.corrected_by_request IS NOT NULL
                         AND (TG_OP = 'INSERT' OR NEW.corrected_by_request IS DISTINCT FROM OLD.corrected_by_request);
BEGIN
    SELECT * INTO v_s FROM org_settings WHERE org_id = NEW.org_id;

    -- check-in only from office networks, unless applied from an approved correction
    IF NEW.check_in_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.check_in_at IS DISTINCT FROM OLD.check_in_at) THEN
        IF v_correct THEN
            IF NOT EXISTS (SELECT 1 FROM requests r WHERE r.id = NEW.corrected_by_request
                              AND r.type = 'attendance_correction' AND r.status IN ('approved', 'applied')) THEN
                RAISE EXCEPTION 'Corrections need an approved attendance_correction request';
            END IF;
        ELSIF NOT EXISTS (SELECT 1 FROM org_office_networks n
                           WHERE n.org_id = NEW.org_id AND NEW.check_in_ip <<= n.network) THEN
            RAISE EXCEPTION 'Check-in is only allowed from the office network';
        END IF;
        IF NOT is_system() AND NOT v_correct AND NEW.member_id <> current_member_id() THEN
            RAISE EXCEPTION 'People check in for themselves only';
        END IF;
        -- on time or late
        v_local := (NEW.check_in_at AT TIME ZONE v_s.timezone)::time;
        NEW.status := CASE WHEN v_local > v_s.work_start_time + make_interval(mins => v_s.late_grace_minutes)
                           THEN 'late' ELSE 'present' END::attendance_status;
    END IF;
    IF TG_OP = 'UPDATE' AND NOT is_system() AND NOT v_correct
       AND NEW.member_id <> current_member_id() THEN
        RAISE EXCEPTION 'Attendance is changed only by its owner (check-out) or through a correction';
    END IF;
    IF v_correct THEN NEW.auto_checked_out := false; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER attendance_guard BEFORE INSERT OR UPDATE ON attendance_days
    FOR EACH ROW EXECUTE FUNCTION trg_attendance_guard();

CREATE FUNCTION trg_attendance_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Attendance records are never deleted'; END $$;
CREATE TRIGGER attendance_no_delete BEFORE DELETE ON attendance_days FOR EACH ROW EXECUTE FUNCTION trg_attendance_no_delete();

CREATE FUNCTION trg_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM requests r WHERE r.id = NEW.request_id
                     AND r.type = 'attendance_correction' AND r.requested_by = NEW.member_id) THEN
        RAISE EXCEPTION 'Corrections must hang off the member''s own attendance_correction request';
    END IF;
    IF NEW.attendance_day_id IS NOT NULL THEN
        SELECT to_jsonb(a) INTO NEW.original_snapshot FROM attendance_days a WHERE a.id = NEW.attendance_day_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER correction_guard BEFORE INSERT ON attendance_corrections
    FOR EACH ROW EXECUTE FUNCTION trg_correction_guard();

-- ---- ratings (§13) -----------------------------------------------------------
CREATE FUNCTION trg_rating_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_p projects%ROWTYPE; v_rater project_role; v_ratee project_role;
BEGIN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Ratings cannot be changed or deleted'; END IF;
    SELECT * INTO v_p FROM projects WHERE id = NEW.project_id;
    IF v_p.completed_at IS NULL OR now() > v_p.rating_closes_at THEN
        RAISE EXCEPTION 'The rating window for this project is not open';
    END IF;
    IF NOT is_system() AND NEW.rater_member_id <> current_member_id() THEN
        RAISE EXCEPTION 'You can only submit your own ratings';
    END IF;
    -- both must have been on the project when it completed
    SELECT role INTO v_rater FROM project_members WHERE project_id = NEW.project_id AND member_id = NEW.rater_member_id
       AND added_at <= v_p.completed_at AND (removed_at IS NULL OR removed_at > v_p.completed_at) LIMIT 1;
    SELECT role INTO v_ratee FROM project_members WHERE project_id = NEW.project_id AND member_id = NEW.ratee_member_id
       AND added_at <= v_p.completed_at AND (removed_at IS NULL OR removed_at > v_p.completed_at) LIMIT 1;
    IF v_rater IS NULL OR v_ratee IS NULL OR v_rater = v_ratee THEN
        RAISE EXCEPTION 'Employees rate managers, and managers rate employees, on the same project';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER rating_guard BEFORE INSERT OR UPDATE OR DELETE ON project_ratings
    FOR EACH ROW EXECUTE FUNCTION trg_rating_guard();

-- ---- platform requests ----------------------------------------------------
CREATE FUNCTION trg_platform_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.type = 'ceo_recovery' AND (SELECT role FROM org_members WHERE id = NEW.requested_by) <> 'coo' THEN
        RAISE EXCEPTION 'CEO recovery is requested by a COO';
    END IF;
    IF NEW.type = 'remove_last_ceo' AND (SELECT role FROM org_members WHERE id = NEW.requested_by) <> 'ceo' THEN
        RAISE EXCEPTION 'Last-CEO removal is requested by the CEO';
    END IF;
    IF (SELECT role FROM org_members WHERE id = NEW.target_member_id) <> 'ceo' THEN
        RAISE EXCEPTION 'Target must be a CEO';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER platform_request_guard BEFORE INSERT ON platform_requests
    FOR EACH ROW EXECUTE FUNCTION trg_platform_request_guard();

-- ---- history: append-only audit log ------------------------------------------
CREATE FUNCTION trg_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_new jsonb; v_old jsonb; v_org uuid;
BEGIN
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    v_org := coalesce((coalesce(v_new, v_old) ->> 'org_id')::uuid,
                      CASE WHEN TG_TABLE_NAME = 'orgs' THEN (coalesce(v_new, v_old) ->> 'id')::uuid END);
    -- never store secrets in history
    v_new := v_new - 'password_hash' - 'mfa_secret_enc' - 'reset_token_hash';
    v_old := v_old - 'password_hash' - 'mfa_secret_enc' - 'reset_token_hash';
    INSERT INTO audit_log (org_id, actor_user_id, actor_member_id, action, table_name, row_id, old_data, new_data, client_ip)
    VALUES (v_org, current_user_id(), current_member_id(), TG_OP, TG_TABLE_NAME,
            coalesce(v_new, v_old) ->> coalesce(nullif(TG_ARGV[0], ''), 'id'),
            v_old, v_new, nullif(current_setting('app.client_ip', true), '')::inet);
    RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'game_masters', 'orgs', 'org_settings', 'org_office_networks', 'org_holidays',
                             'subscriptions', 'org_members', 'projects', 'project_members', 'project_completion_ticks',
                             'tasks', 'task_assignees', 'requests', 'project_invites', 'meetings', 'meeting_invitees',
                             'leave_types', 'leave_requests', 'attendance_days', 'attendance_corrections',
                             'platform_requests', 'audit_notes']
    LOOP
        EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON %I
                        FOR EACH ROW EXECUTE FUNCTION trg_audit(%L)', t,
                       CASE t WHEN 'users' THEN 'id' WHEN 'game_masters' THEN 'user_id'
                              WHEN 'org_settings' THEN 'org_id' WHEN 'leave_requests' THEN 'request_id'
                              WHEN 'attendance_corrections' THEN 'request_id' WHEN 'org_holidays' THEN 'holiday_date'
                              WHEN 'project_completion_ticks' THEN 'project_id' WHEN 'meeting_invitees' THEN 'meeting_id'
                              ELSE 'id' END);
    END LOOP;
END $$;

CREATE FUNCTION trg_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'History is append-only. CEOs add notes in audit_notes instead.'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION trg_audit_immutable();
CREATE TRIGGER audit_notes_immutable BEFORE UPDATE OR DELETE ON audit_notes
    FOR EACH ROW EXECUTE FUNCTION trg_audit_immutable();

CREATE FUNCTION trg_audit_note_ceo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF member_role_of(NEW.author_id) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Only a CEO can add notes to history';
    END IF;
    IF (SELECT org_id FROM audit_log WHERE id = NEW.audit_id) IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'History entry belongs to another org';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER audit_note_ceo BEFORE INSERT ON audit_notes FOR EACH ROW EXECUTE FUNCTION trg_audit_note_ceo();

-- =====================================================================
-- 14. Views
-- =====================================================================

-- Project / task staffing flags (§2): at least one manager and one employee.
CREATE VIEW v_project_flags WITH (security_invoker = true) AS
SELECT p.id AS project_id, p.org_id, p.name, p.status,
       count(*) FILTER (WHERE pm.role = 'manager')  AS manager_count,
       count(*) FILTER (WHERE pm.role = 'employee') AS employee_count,
       count(*) FILTER (WHERE pm.is_lead)           AS lead_count,
       count(*) FILTER (WHERE pm.role = 'manager')  = 0 AS no_manager,
       count(*) FILTER (WHERE pm.role = 'employee') = 0 AS no_employee
  FROM projects p
  LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.removed_at IS NULL
 WHERE p.status IN ('active', 'pending_lead_approval')
 GROUP BY p.id;

CREATE VIEW v_task_flags WITH (security_invoker = true) AS
SELECT t.id AS task_id, t.org_id, t.project_id, t.status, t.urgency, t.due_at,
       count(ta.*) FILTER (WHERE ta.role = 'manager')  = 0 AS no_manager,
       count(ta.*) FILTER (WHERE ta.role = 'employee') = 0 AS no_employee,
       count(ta.*) = 0                                       AS no_assignee,
       t.due_at < now()                                       AS overdue
  FROM tasks t
  LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.removed_at IS NULL
 WHERE t.status NOT IN ('done', 'cancelled')
 GROUP BY t.id;

-- Progress bar (§5): done / (all - cancelled).
CREATE VIEW v_project_progress WITH (security_invoker = true) AS
SELECT p.id AS project_id, p.org_id,
       count(t.*) FILTER (WHERE t.status = 'done')                  AS done_tasks,
       count(t.*) FILTER (WHERE t.status <> 'cancelled')            AS counted_tasks,
       CASE WHEN count(t.*) FILTER (WHERE t.status <> 'cancelled') = 0 THEN NULL
            ELSE round(100.0 * count(t.*) FILTER (WHERE t.status = 'done')
                             / count(t.*) FILTER (WHERE t.status <> 'cancelled'), 1) END AS percent_done
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
 GROUP BY p.id;

-- Approved, not-cancelled leave.
CREATE VIEW v_approved_leave WITH (security_invoker = true) AS
SELECT lr.*, lt.code AS leave_code, lt.is_paid
  FROM leave_requests lr
  JOIN requests r     ON r.id = lr.request_id
  JOIN leave_types lt ON lt.id = lr.leave_type_id
 WHERE r.status IN ('approved', 'applied') AND lr.cancelled_at IS NULL;

-- Workload colour (§7): open tasks + active projects; archived projects excluded.
CREATE VIEW v_member_workload WITH (security_invoker = true) AS
WITH t AS (
    SELECT ta.member_id, count(DISTINCT ta.task_id) AS open_tasks
      FROM task_assignees ta JOIN tasks tk ON tk.id = ta.task_id
      JOIN projects p ON p.id = tk.project_id
     WHERE ta.removed_at IS NULL AND tk.status NOT IN ('done', 'cancelled')
       AND p.status IN ('active', 'pending_lead_approval')
     GROUP BY ta.member_id),
pr AS (
    SELECT pm.member_id, count(DISTINCT pm.project_id) AS active_projects
      FROM project_members pm JOIN projects p ON p.id = pm.project_id
     WHERE pm.removed_at IS NULL AND p.status IN ('active', 'pending_lead_approval')
     GROUP BY pm.member_id)
SELECT m.id AS member_id, m.org_id,
       coalesce(t.open_tasks, 0)       AS open_tasks,
       coalesce(pr.active_projects, 0) AS active_projects,
       CASE WHEN coalesce(t.open_tasks, 0) >= s.workload_red_tasks
              OR coalesce(pr.active_projects, 0) >= s.workload_red_projects THEN 'red'
            WHEN coalesce(t.open_tasks, 0) >= s.workload_amber_tasks
              OR coalesce(pr.active_projects, 0) >= s.workload_amber_projects THEN 'amber'
            ELSE 'green' END AS level,
       (SELECT max(l.end_date) FROM v_approved_leave l
         WHERE l.member_id = m.id AND current_date BETWEEN l.start_date AND l.end_date) AS on_leave_until
  FROM org_members m
  JOIN org_settings s ON s.org_id = m.org_id
  LEFT JOIN t  ON t.member_id  = m.id
  LEFT JOIN pr ON pr.member_id = m.id
 WHERE m.status = 'active' AND m.role IN ('manager', 'employee');

-- Leave balance per calendar year.
CREATE VIEW v_leave_balance WITH (security_invoker = true) AS
SELECT m.id AS member_id, m.org_id, lt.id AS leave_type_id, lt.code, y.year,
       lt.yearly_allowance_days AS allowance,
       coalesce(sum(l.days) FILTER (WHERE extract(year FROM l.start_date) = y.year), 0) AS used,
       lt.yearly_allowance_days
         - coalesce(sum(l.days) FILTER (WHERE extract(year FROM l.start_date) = y.year), 0) AS remaining
  FROM org_members m
  JOIN leave_types lt ON lt.org_id = m.org_id AND lt.is_active
  CROSS JOIN (SELECT extract(year FROM current_date)::integer AS year) y
  LEFT JOIN v_approved_leave l ON l.member_id = m.id AND l.leave_type_id = lt.id
 WHERE m.status = 'active'
 GROUP BY m.id, lt.id, y.year;

-- Calendar feed (§6): task due dates, meetings, approved leave, holidays.
CREATE VIEW v_calendar_events WITH (security_invoker = true) AS
SELECT ta.org_id, ta.member_id, 'task_due'::text AS kind, t.id AS ref_id, t.title,
       t.due_at AS starts_at, t.due_at AS ends_at, NULL::text AS link, NULL::text AS location
  FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
 WHERE ta.removed_at IS NULL AND t.status NOT IN ('done', 'cancelled')
UNION ALL
SELECT mi.org_id, mi.member_id, 'meeting', mt.id, mt.title, mt.starts_at, mt.ends_at, mt.meeting_link, mt.location
  FROM meeting_invitees mi JOIN meetings mt ON mt.id = mi.meeting_id
 WHERE mt.cancelled_at IS NULL
UNION ALL
SELECT mt.org_id, mt.created_by, 'meeting', mt.id, mt.title, mt.starts_at, mt.ends_at, mt.meeting_link, mt.location
  FROM meetings mt WHERE mt.cancelled_at IS NULL
UNION ALL
SELECT l.org_id, l.member_id, 'leave', l.request_id, initcap(l.leave_code) || ' leave',
       l.start_date::timestamptz, (l.end_date + 1)::timestamptz, NULL, NULL
  FROM v_approved_leave l
UNION ALL
SELECT h.org_id, NULL, 'holiday', NULL, h.name, h.holiday_date::timestamptz, (h.holiday_date + 1)::timestamptz, NULL, NULL
  FROM org_holidays h;

-- Seat usage and downgrade candidates (§9).
CREATE VIEW v_org_seat_usage WITH (security_invoker = true) AS
SELECT o.id AS org_id, o.plan_code, p.seat_limit, org_seats_used(o.id) AS seats_used,
       round(100.0 * org_seats_used(o.id) / p.seat_limit, 1) AS percent_used,
       CASE WHEN org_seats_used(o.id) >= p.seat_limit        THEN 100
            WHEN org_seats_used(o.id) >= p.seat_limit * 0.95 THEN 95
            WHEN org_seats_used(o.id) >= p.seat_limit * 0.80 THEN 80 END AS warning_level
  FROM orgs o JOIN plans p ON p.code = o.plan_code;

CREATE VIEW v_downgrade_candidates WITH (security_invoker = true) AS
SELECT m.org_id, m.id AS member_id, u.full_name, m.role, m.last_active_at,
       row_number() OVER (PARTITION BY m.org_id ORDER BY m.last_active_at ASC NULLS FIRST) AS suggested_order
  FROM org_members m JOIN users u ON u.id = m.user_id
 WHERE m.status = 'active' AND m.role IN ('manager', 'employee');

-- Anonymous rating summary (§13): only averages, only with 3+ ratings.
CREATE VIEW v_rating_summary AS   -- runs with the owner's rights on purpose (raw ratings stay unreadable)
SELECT r.org_id, r.ratee_member_id AS member_id,
       count(*) AS rating_count, round(avg(r.stars), 2) AS rating_avg
  FROM project_ratings r JOIN org_settings s ON s.org_id = r.org_id
 WHERE r.org_id = current_org_id()
   AND r.created_at >= now() - interval '12 months'
 GROUP BY r.org_id, r.ratee_member_id, s.rating_min_count
HAVING count(*) >= s.rating_min_count;

-- Latest performance score with trend vs. 30 days earlier (CEO/COO dashboard).
CREATE VIEW v_performance_dashboard WITH (security_invoker = true) AS
SELECT cur.org_id, cur.member_id, cur.computed_on, cur.final_score, cur.band, cur.is_new, cur.has_ratings,
       cur.attendance_score, cur.rating_score, cur.ontime_score,
       cur.final_score - prev.final_score AS change_vs_prev_30d
  FROM (SELECT DISTINCT ON (member_id) * FROM performance_scores ORDER BY member_id, computed_on DESC) cur
  LEFT JOIN performance_scores prev
         ON prev.member_id = cur.member_id AND prev.computed_on = cur.computed_on - 30;

-- =====================================================================
-- 15. Jobs (run nightly / every few minutes by the scheduler)
-- =====================================================================

-- Expire requests and invites past their 3-working-day window (§3, §4).
CREATE FUNCTION job_expire_pending() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; m integer;
BEGIN
    PERFORM set_config('app.member_id', '', true);
    UPDATE requests SET status = 'expired', decision_reason = 'No decision within the time limit'
     WHERE status = 'pending' AND expires_at < now();
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE project_invites SET status = 'expired' WHERE status IN ('pending', 'declined') AND expires_at < now();
    GET DIAGNOSTICS m = ROW_COUNT;
    RETURN n + m;   -- the app notifies CEO/COO and the managers involved
END $$;

-- Auto check-out at end of day (§12).
CREATE FUNCTION job_auto_checkout(p_org uuid, p_day date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; v_tz text;
BEGIN
    PERFORM set_config('app.member_id', '', true);
    SELECT timezone INTO v_tz FROM org_settings WHERE org_id = p_org;
    UPDATE attendance_days
       SET check_out_at = ((p_day + 1)::timestamp AT TIME ZONE v_tz) - interval '1 second',
           auto_checked_out = true
     WHERE org_id = p_org AND work_date = p_day AND check_in_at IS NOT NULL AND check_out_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- Performance score (§13). Computes the 30-day window ending p_as_of.
CREATE FUNCTION job_compute_performance(p_org uuid, p_as_of date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE
    s        org_settings%ROWTYPE;
    m        record;
    v_start  date := p_as_of - 29;
    d        date;
    v_w      numeric; v_pts numeric;
    v_att    numeric; v_rat numeric; v_ont numeric;
    v_cnt    integer; v_sum numeric; v_orgavg numeric; v_avg numeric;
    v_tot    integer; v_ok integer;
    v_wsum   numeric; v_final numeric; v_band performance_band;
    v_day    attendance_days%ROWTYPE;
    v_leave  record;
    n        integer := 0;
BEGIN
    IF p_org IS DISTINCT FROM current_org_id() THEN
        RAISE EXCEPTION 'Run the job with app.org_id set to the org being scored';
    END IF;
    SELECT * INTO s FROM org_settings WHERE org_id = p_org;
    SELECT coalesce(avg(stars), 3) INTO v_orgavg FROM project_ratings
     WHERE org_id = p_org AND created_at >= p_as_of - interval '12 months';

    FOR m IN SELECT * FROM org_members WHERE org_id = p_org AND status = 'active' AND role IN ('manager', 'employee') LOOP
        -- A. attendance
        v_w := 0; v_pts := 0;
        d := greatest(v_start, (m.joined_at AT TIME ZONE s.timezone)::date);
        WHILE d <= p_as_of LOOP
            IF NOT is_weekend_or_holiday(p_org, d) THEN
                SELECT l.is_paid, l.over_allowance INTO v_leave FROM v_approved_leave l
                 WHERE l.member_id = m.id AND d BETWEEN l.start_date AND l.end_date LIMIT 1;
                IF FOUND AND v_leave.is_paid AND NOT v_leave.over_allowance THEN
                    NULL;                                   -- paid leave: neutral, not a working day
                ELSIF FOUND THEN
                    v_w := v_w + 1; v_pts := v_pts + s.points_unpaid_leave;
                ELSE
                    v_w := v_w + 1;
                    SELECT * INTO v_day FROM attendance_days WHERE member_id = m.id AND work_date = d;
                    IF FOUND AND v_day.status IN ('present', 'late') THEN
                        v_pts := v_pts + least(
                            CASE WHEN v_day.status = 'late' THEN s.points_late ELSE 1 END,
                            CASE WHEN v_day.auto_checked_out THEN s.points_missing_checkout ELSE 1 END);
                    END IF;                                 -- absent / no row: 0
                END IF;
            END IF;
            d := d + 1;
        END LOOP;
        v_att := CASE WHEN v_w > 0 THEN round(100 * v_pts / v_w, 2) END;

        -- B. ratings (last 12 months, smoothed toward the org average)
        SELECT count(*), coalesce(sum(stars), 0) INTO v_cnt, v_sum FROM project_ratings
         WHERE ratee_member_id = m.id AND created_at >= p_as_of - interval '12 months';
        IF v_cnt >= s.rating_min_count THEN
            v_avg := (s.rating_prior_weight * v_orgavg + v_sum) / (s.rating_prior_weight + v_cnt);
            v_rat := round((v_avg - 1) / 4 * 100, 2);
        ELSE
            v_avg := NULL; v_rat := NULL;
        END IF;

        -- C. on-time tasks: done in window + still open past due
        SELECT count(*) FILTER (WHERE t.status = 'done' AND t.completed_at::date BETWEEN v_start AND p_as_of)
             + count(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_at::date <= p_as_of),
               count(*) FILTER (WHERE t.status = 'done' AND t.completed_at::date BETWEEN v_start AND p_as_of
                                  AND t.completed_at <= t.due_at)
          INTO v_tot, v_ok
          FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
         WHERE ta.member_id = m.id AND ta.removed_at IS NULL;
        v_ont := CASE WHEN v_tot > 0 THEN round(100.0 * v_ok / v_tot, 2) END;

        -- final: weights re-shared across the inputs that exist
        v_wsum := (CASE WHEN v_att IS NOT NULL THEN s.weight_attendance ELSE 0 END)
                + (CASE WHEN v_rat IS NOT NULL THEN s.weight_rating ELSE 0 END)
                + (CASE WHEN v_ont IS NOT NULL THEN s.weight_ontime ELSE 0 END);
        IF v_wsum > 0 THEN
            v_final := round(( coalesce(v_att, 0) * CASE WHEN v_att IS NOT NULL THEN s.weight_attendance ELSE 0 END
                             + coalesce(v_rat, 0) * CASE WHEN v_rat IS NOT NULL THEN s.weight_rating ELSE 0 END
                             + coalesce(v_ont, 0) * CASE WHEN v_ont IS NOT NULL THEN s.weight_ontime ELSE 0 END) / v_wsum, 2);
            v_band := CASE WHEN v_final >= 85 THEN 'excellent' WHEN v_final >= 70 THEN 'good'
                           WHEN v_final >= 50 THEN 'needs_attention' ELSE 'poor' END;
        ELSE
            v_final := NULL; v_band := NULL;
        END IF;

        INSERT INTO performance_scores (org_id, member_id, computed_on, window_start, working_days, attendance_points,
                                        attendance_score, rating_count, rating_avg, rating_score,
                                        ontime_total, ontime_on_time, ontime_score, final_score, band, is_new, has_ratings)
        VALUES (p_org, m.id, p_as_of, v_start, v_w, v_pts, v_att, v_cnt, v_avg, v_rat,
                v_tot, v_ok, v_ont, v_final, v_band,
                m.joined_at > (p_as_of - 30)::timestamptz, v_cnt >= s.rating_min_count)
        ON CONFLICT (member_id, computed_on) DO UPDATE SET
            working_days = EXCLUDED.working_days, attendance_points = EXCLUDED.attendance_points,
            attendance_score = EXCLUDED.attendance_score, rating_count = EXCLUDED.rating_count,
            rating_avg = EXCLUDED.rating_avg, rating_score = EXCLUDED.rating_score,
            ontime_total = EXCLUDED.ontime_total, ontime_on_time = EXCLUDED.ontime_on_time,
            ontime_score = EXCLUDED.ontime_score, final_score = EXCLUDED.final_score,
            band = EXCLUDED.band, is_new = EXCLUDED.is_new, has_ratings = EXCLUDED.has_ratings;
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;

-- =====================================================================
-- 15b. Functions for the places where row-level security would otherwise
--      hide everything: login (no org chosen yet) and the gameMaster console.
--      They run with the owner's rights, return only what that screen needs,
--      and check who is asking.
-- =====================================================================

-- Scheduled jobs: which orgs to loop over (ids, status and time zone only). The job then sets
-- app.org_id to each id in turn and leaves app.member_id empty.
CREATE FUNCTION list_active_org_ids()
RETURNS TABLE (org_id uuid, status org_status, timezone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT o.id, o.status, s.timezone FROM orgs o JOIN org_settings s ON s.org_id = o.id ORDER BY o.id
$$;

-- Login / org switcher: the memberships of the signed-in user.
-- The app sets app.user_id to the verified user first.
CREATE FUNCTION my_memberships(p_user uuid)
RETURNS TABLE (member_id uuid, org_id uuid, org_name text, org_status org_status, role member_role, status member_status)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF p_user IS DISTINCT FROM current_user_id() THEN
        RAISE EXCEPTION 'You can only list your own memberships' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT m.id, o.id, o.name, o.status, m.role, m.status
      FROM org_members m JOIN orgs o ON o.id = m.org_id
     WHERE m.user_id = p_user ORDER BY o.name;
END $$;

CREATE FUNCTION gm_assert() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM game_masters WHERE user_id = current_user_id() AND status = 'active') THEN
        RAISE EXCEPTION 'Only a gameMaster can do this' USING ERRCODE = 'insufficient_privilege';
    END IF;
END $$;

-- Org list for the gameMaster: counts only, never org data (§1).
CREATE FUNCTION gm_list_orgs()
RETURNS TABLE (org_id uuid, name text, status org_status, plan_code text, ceo_count bigint, coo_count bigint,
               over_threshold boolean, seats_used integer, seat_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT o.id, o.name, o.status, o.plan_code,
           count(*) FILTER (WHERE m.role = 'ceo'), count(*) FILTER (WHERE m.role = 'coo'),
           count(*) FILTER (WHERE m.role IN ('ceo', 'coo')) > 25,
           org_seats_used(o.id), p.seat_limit
      FROM orgs o JOIN plans p ON p.code = o.plan_code
      LEFT JOIN org_members m ON m.org_id = o.id AND m.status = 'active'
     GROUP BY o.id, p.seat_limit ORDER BY o.name;
END $$;

-- Create an org together with its first CEO (one transaction). Call it in its own
-- transaction: it sets app.org_id to the new org for the rest of that transaction.
CREATE FUNCTION gm_create_org(p_name text, p_plan text, p_ceo_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_org uuid;
BEGIN
    PERFORM gm_assert();
    v_org := gen_random_uuid();
    -- the checks that run while the org is created (they run with the caller's rights) must see the new org
    PERFORM set_config('app.org_id', v_org::text, true);
    INSERT INTO orgs (id, name, plan_code, created_by_gm) VALUES (v_org, p_name, p_plan, current_user_id());
    INSERT INTO org_members (org_id, user_id, role) VALUES (v_org, p_ceo_user, 'ceo');
    RETURN v_org;
END $$;

-- Block or unblock an org (abuse guard, §1).
CREATE FUNCTION gm_set_org_blocked(p_org uuid, p_blocked boolean, p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    IF p_blocked THEN
        UPDATE orgs SET status = 'blocked', blocked_by_gm = current_user_id(), blocked_reason = p_reason, blocked_at = now()
         WHERE id = p_org;
    ELSE
        UPDATE orgs SET status = 'active', blocked_by_gm = NULL, blocked_reason = NULL, blocked_at = NULL
         WHERE id = p_org AND status = 'blocked';
    END IF;
END $$;

-- Change an org's plan and record it. A downgrade is refused while the org has more seats in use than the
-- new plan allows (the CEO suspends accounts first). Call it in its own transaction, like gm_create_org.
CREATE FUNCTION gm_set_org_plan(p_org uuid, p_plan text, p_period_end timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    PERFORM set_config('app.org_id', p_org::text, true);
    UPDATE orgs SET plan_code = p_plan WHERE id = p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'No such org'; END IF;
    INSERT INTO subscriptions (org_id, plan_code, current_period_start, current_period_end, payment_status)
    VALUES (p_org, p_plan, now(), coalesce(p_period_end, now() + interval '1 month'), 'paid');
END $$;

-- CEO recovery and last-CEO removal requests (§8, §3).
CREATE FUNCTION gm_list_platform_requests()
RETURNS TABLE (id uuid, org_id uuid, org_name text, type platform_req_type, status platform_req_status,
               target_member_id uuid, new_email citext, replacement_user_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT r.id, r.org_id, o.name, r.type, r.status, r.target_member_id, r.new_email, r.replacement_user_id, r.created_at
      FROM platform_requests r JOIN orgs o ON o.id = r.org_id ORDER BY r.created_at DESC;
END $$;

-- After the offline check: mark verified and store the hash of the reset link.
CREATE FUNCTION gm_verify_platform_request(p_id uuid, p_reset_token_hash text DEFAULT NULL, p_reset_expires timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    UPDATE platform_requests
       SET status = 'verified', verified_by_gm = current_user_id(), verified_at = now(),
           reset_token_hash = p_reset_token_hash, reset_expires_at = p_reset_expires
     WHERE id = p_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending request with that id'; END IF;
END $$;

-- Last-CEO removal: the replacement becomes CEO, then the old CEO is deactivated.
CREATE FUNCTION gm_complete_remove_last_ceo(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE r platform_requests%ROWTYPE;
BEGIN
    PERFORM gm_assert();
    SELECT * INTO r FROM platform_requests WHERE id = p_id AND type = 'remove_last_ceo' AND status = 'verified';
    IF NOT FOUND THEN RAISE EXCEPTION 'Request is not a verified remove_last_ceo request'; END IF;
    PERFORM set_config('app.org_id', r.org_id::text, true);
    INSERT INTO org_members (org_id, user_id, role) VALUES (r.org_id, r.replacement_user_id, 'ceo')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'ceo', status = 'active', deactivated_at = NULL, suspended_at = NULL;
    UPDATE org_members SET status = 'deactivated', deactivated_at = now() WHERE id = r.target_member_id;
    UPDATE platform_requests SET status = 'completed', completed_at = now() WHERE id = p_id;
END $$;

-- =====================================================================
-- 16. Row-level security: every org table is filtered by app.org_id
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['org_settings', 'org_office_networks', 'org_holidays', 'subscriptions', 'org_members',
                             'projects', 'project_members', 'project_completion_ticks', 'tasks', 'task_assignees',
                             'task_status_history', 'requests', 'project_invites', 'meetings', 'meeting_invitees',
                             'leave_types', 'leave_requests', 'attendance_days', 'attendance_corrections',
                             'project_ratings', 'performance_scores', 'platform_requests', 'audit_notes',
                             'notifications', 'notification_email_prefs']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id())', t);
    END LOOP;
END $$;
-- Performance scores (§13): only a CEO or COO can read them; the app role cannot write them.
DROP POLICY org_isolation ON performance_scores;
CREATE POLICY ceo_coo_read ON performance_scores FOR SELECT
    USING (org_id = current_org_id() AND is_ceo_or_coo(current_member_id()));

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON orgs USING (id = current_org_id());
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON audit_log USING (org_id = current_org_id()) WITH CHECK (true);

-- Application role. The owner (migrations) bypasses RLS; the app never runs as the owner.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hrms_app') THEN
        CREATE ROLE hrms_app NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA hrms TO hrms_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA hrms TO hrms_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA hrms TO hrms_app;
GRANT DELETE ON project_completion_ticks, meeting_invitees, org_office_networks, org_holidays, notification_email_prefs TO hrms_app;
REVOKE UPDATE, DELETE ON audit_log, audit_notes FROM hrms_app;
-- ratings are anonymous: the app can insert but never read raw rows
REVOKE SELECT, UPDATE ON project_ratings FROM hrms_app;
GRANT SELECT ON v_rating_summary TO hrms_app;
GRANT EXECUTE ON FUNCTION list_active_org_ids, my_memberships, gm_list_orgs, gm_create_org, gm_set_org_blocked,
    gm_list_platform_requests, gm_verify_platform_request, gm_complete_remove_last_ceo, gm_set_org_plan TO hrms_app;

COMMIT;

-- ===== BEGIN docs/hrms/0002_auth_sessions.sql =====
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

-- ===== BEGIN docs/hrms/0003_ratings_given.sql =====
-- =====================================================================
-- 0003: which people the signed-in member has already rated on a project.
-- The app role cannot read project_ratings (ratings are anonymous), so the
-- "ratings due" screen needs this. It returns only the caller's OWN given
-- ratings: who they rated, never what anyone else rated.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE FUNCTION my_given_ratings(p_project uuid)
RETURNS TABLE (ratee_member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT r.ratee_member_id
      FROM project_ratings r
     WHERE r.project_id = p_project
       AND r.org_id = current_org_id()
       AND r.rater_member_id = current_member_id()
$$;

GRANT EXECUTE ON FUNCTION my_given_ratings(uuid) TO hrms_app;
COMMIT;

-- ===== BEGIN docs/hrms/0004_job_runs.sql =====
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

-- ===== BEGIN docs/hrms/0005_gm_creator_may_confirm.sql =====
-- =====================================================================
-- 0005: the gameMaster who added a new gameMaster may also confirm them.
-- Still refused: the person confirming themselves, and a confirmer who is
-- not an active gameMaster (trg_gm_confirmer_active).
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE game_masters DROP CONSTRAINT game_masters_check;

COMMIT;

-- ===== BEGIN docs/hrms/0006_checkin_ip_optional.sql =====
-- =====================================================================
-- 0006: office IP check-in is only enforced when the CEO or COO has set
-- office networks. An org with none accepts check-in from anywhere.
--   * trg_attendance_guard skips the network test when the org has no
--     org_office_networks rows.
--   * a present/late day no longer needs a recorded address (the API still
--     records it whenever it can read one).
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE attendance_days DROP CONSTRAINT attendance_days_check;
ALTER TABLE attendance_days ADD CONSTRAINT attendance_days_present_has_checkin
    CHECK (status NOT IN ('present', 'late') OR check_in_at IS NOT NULL);

CREATE OR REPLACE FUNCTION trg_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_s       org_settings%ROWTYPE;
    v_local   time;
    v_correct boolean := NEW.corrected_by_request IS NOT NULL
                         AND (TG_OP = 'INSERT' OR NEW.corrected_by_request IS DISTINCT FROM OLD.corrected_by_request);
BEGIN
    SELECT * INTO v_s FROM org_settings WHERE org_id = NEW.org_id;

    -- check-in must come from an office network, but only when the org has set any
    IF NEW.check_in_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.check_in_at IS DISTINCT FROM OLD.check_in_at) THEN
        IF v_correct THEN
            IF NOT EXISTS (SELECT 1 FROM requests r WHERE r.id = NEW.corrected_by_request
                              AND r.type = 'attendance_correction' AND r.status IN ('approved', 'applied')) THEN
                RAISE EXCEPTION 'Corrections need an approved attendance_correction request';
            END IF;
        ELSIF EXISTS (SELECT 1 FROM org_office_networks n WHERE n.org_id = NEW.org_id)
              AND NOT EXISTS (SELECT 1 FROM org_office_networks n
                               WHERE n.org_id = NEW.org_id AND NEW.check_in_ip <<= n.network) THEN
            RAISE EXCEPTION 'Check-in is only allowed from the office network';
        END IF;
        IF NOT is_system() AND NOT v_correct AND NEW.member_id <> current_member_id() THEN
            RAISE EXCEPTION 'People check in for themselves only';
        END IF;
        -- on time or late
        v_local := (NEW.check_in_at AT TIME ZONE v_s.timezone)::time;
        NEW.status := CASE WHEN v_local > v_s.work_start_time + make_interval(mins => v_s.late_grace_minutes)
                           THEN 'late' ELSE 'present' END::attendance_status;
    END IF;
    IF TG_OP = 'UPDATE' AND NOT is_system() AND NOT v_correct
       AND NEW.member_id <> current_member_id() THEN
        RAISE EXCEPTION 'Attendance is changed only by its owner (check-out) or through a correction';
    END IF;
    IF v_correct THEN NEW.auto_checked_out := false; END IF;
    RETURN NEW;
END $$;

COMMIT;

-- ===== BEGIN docs/hrms/0007_mfa_backup_codes.sql =====
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

-- ===== BEGIN docs/hrms/0008_must_change_password.sql =====
-- =====================================================================
-- 0008: a person given a temporary password (a new gameMaster) must
-- choose their own before doing anything else.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

COMMIT;

-- ===== BEGIN docs/hrms/0009_gm_manage_people.sql =====
-- =====================================================================
-- 0009: a gameMaster manages gameMasters and an org's CEOs.
-- CEOs are reached only through these functions (identity and status,
-- never org data): the gameMaster's session has no org, so row-level
-- security hides everything else.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE FUNCTION gm_list_org_ceos(p_org uuid)
RETURNS TABLE (member_id uuid, user_id uuid, full_name text, email text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT m.id, m.user_id, u.full_name, u.email::text, m.status::text
      FROM org_members m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = p_org AND m.role = 'ceo'
     ORDER BY u.full_name;
END $$;

-- The user behind a CEO membership. Anything that is not a CEO is refused.
CREATE FUNCTION gm_ceo_user(p_member uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_user uuid;
BEGIN
    PERFORM gm_assert();
    SELECT user_id INTO v_user FROM org_members WHERE id = p_member AND role = 'ceo';
    IF v_user IS NULL THEN RAISE EXCEPTION 'That person is not a CEO.'; END IF;
    RETURN v_user;
END $$;

-- Deactivates a CEO. The database still refuses the org's last active CEO.
CREATE FUNCTION gm_deactivate_ceo(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_org uuid;
BEGIN
    PERFORM gm_assert();
    SELECT org_id INTO v_org FROM org_members WHERE id = p_member AND role = 'ceo' AND status <> 'deactivated';
    IF v_org IS NULL THEN RAISE EXCEPTION 'That CEO is not active.'; END IF;
    PERFORM set_config('app.org_id', v_org::text, true);
    UPDATE org_members SET status = 'deactivated', deactivated_at = now() WHERE id = p_member;
END $$;

GRANT EXECUTE ON FUNCTION gm_list_org_ceos, gm_ceo_user, gm_deactivate_ceo TO hrms_app;
COMMIT;

-- ===== BEGIN docs/hrms/0010_gm_deactivate_ceo_keeps_last.sql =====
-- =====================================================================
-- 0010: gm_deactivate_ceo must never remove an org's last active CEO.
-- The row trigger skips system callers, so the function checks itself.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE OR REPLACE FUNCTION gm_deactivate_ceo(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_org uuid;
BEGIN
    PERFORM gm_assert();
    SELECT org_id INTO v_org FROM org_members WHERE id = p_member AND role = 'ceo' AND status <> 'deactivated';
    IF v_org IS NULL THEN RAISE EXCEPTION 'That CEO is not active.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM org_members
                    WHERE org_id = v_org AND role = 'ceo' AND status = 'active' AND id <> p_member) THEN
        RAISE EXCEPTION 'An org must always have at least one active CEO. Removing the last CEO goes through a platform request.';
    END IF;
    PERFORM set_config('app.org_id', v_org::text, true);
    UPDATE org_members SET status = 'deactivated', deactivated_at = now() WHERE id = p_member;
END $$;

COMMIT;

-- ===== BEGIN docs/hrms/0011_employee_code_permanent.sql =====
-- =====================================================================
-- 0011: every member gets a unique employee code that never changes.
--   * a new member without a code takes the org's next one (EMP-0001, ...)
--   * people who have none yet are numbered by join date
--   * a code that is set cannot be changed or cleared
-- Numbers are never reused: deactivated members keep their row and code.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE FUNCTION next_employee_code(p_org uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_n integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('employee_code'), hashtext(p_org::text));
    SELECT coalesce(max(substring(employee_code from '^EMP-([0-9]+)$')::int), 0) + 1
      INTO v_n FROM org_members WHERE org_id = p_org;
    RETURN 'EMP-' || lpad(v_n::text, 4, '0');
END $$;

CREATE FUNCTION trg_member_code_assign() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
        NEW.employee_code := next_employee_code(NEW.org_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER member_code_assign BEFORE INSERT ON org_members
    FOR EACH ROW EXECUTE FUNCTION trg_member_code_assign();

CREATE FUNCTION trg_member_code_permanent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.employee_code IS NOT NULL AND NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
        RAISE EXCEPTION 'The employee code is permanent and cannot be changed.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER member_code_permanent BEFORE UPDATE OF employee_code ON org_members
    FOR EACH ROW EXECUTE FUNCTION trg_member_code_permanent();

-- Number the people who have no code yet, oldest first.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, org_id FROM org_members WHERE employee_code IS NULL ORDER BY joined_at, id LOOP
        UPDATE org_members SET employee_code = next_employee_code(r.org_id) WHERE id = r.id;
    END LOOP;
END $$;

COMMIT;

-- ===== BEGIN docs/hrms/0012_mfa_setup_required.sql =====
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

-- ===== BEGIN docs/hrms/0013_rating_summary_ceo_coo_only.sql =====
-- =====================================================================
-- 0013: the rating-average view answers only CEOs and COOs (and the
-- system jobs). It runs with the owner's rights on purpose, so without
-- this a person could read their own average if any query ever touched it.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

CREATE OR REPLACE VIEW v_rating_summary AS
SELECT r.org_id, r.ratee_member_id AS member_id,
       count(*) AS rating_count, round(avg(r.stars), 2) AS rating_avg
  FROM project_ratings r JOIN org_settings s ON s.org_id = r.org_id
 WHERE r.org_id = current_org_id()
   AND (is_system() OR is_ceo_or_coo(current_member_id()))
   AND r.created_at >= now() - interval '12 months'
 GROUP BY r.org_id, r.ratee_member_id, s.rating_min_count
HAVING count(*) >= s.rating_min_count;

COMMIT;

-- ===== BEGIN docs/hrms/0014_early_task_bonus.sql =====
-- =====================================================================
-- 0014: early-finish bonus. A task finished strictly before its deadline
-- earns +1 point on the 0-100 performance score for every manager and
-- employee assigned to it, over the same rolling 30 days, capped at 100.
-- The band is decided after the bonus. early_tasks keeps the count so the
-- CEO and COO can see where the points came from.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE performance_scores ADD COLUMN early_tasks integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION job_compute_performance(p_org uuid, p_as_of date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE
    s        org_settings%ROWTYPE;
    m        record;
    v_start  date := p_as_of - 29;
    d        date;
    v_w      numeric; v_pts numeric;
    v_att    numeric; v_rat numeric; v_ont numeric;
    v_cnt    integer; v_sum numeric; v_orgavg numeric; v_avg numeric;
    v_tot    integer; v_ok integer; v_early integer;
    v_wsum   numeric; v_final numeric; v_band performance_band;
    v_day    attendance_days%ROWTYPE;
    v_leave  record;
    n        integer := 0;
BEGIN
    IF p_org IS DISTINCT FROM current_org_id() THEN
        RAISE EXCEPTION 'Run the job with app.org_id set to the org being scored';
    END IF;
    SELECT * INTO s FROM org_settings WHERE org_id = p_org;
    SELECT coalesce(avg(stars), 3) INTO v_orgavg FROM project_ratings
     WHERE org_id = p_org AND created_at >= p_as_of - interval '12 months';

    FOR m IN SELECT * FROM org_members WHERE org_id = p_org AND status = 'active' AND role IN ('manager', 'employee') LOOP
        -- A. attendance
        v_w := 0; v_pts := 0;
        d := greatest(v_start, (m.joined_at AT TIME ZONE s.timezone)::date);
        WHILE d <= p_as_of LOOP
            IF NOT is_weekend_or_holiday(p_org, d) THEN
                SELECT l.is_paid, l.over_allowance INTO v_leave FROM v_approved_leave l
                 WHERE l.member_id = m.id AND d BETWEEN l.start_date AND l.end_date LIMIT 1;
                IF FOUND AND v_leave.is_paid AND NOT v_leave.over_allowance THEN
                    NULL;                                   -- paid leave: neutral, not a working day
                ELSIF FOUND THEN
                    v_w := v_w + 1; v_pts := v_pts + s.points_unpaid_leave;
                ELSE
                    v_w := v_w + 1;
                    SELECT * INTO v_day FROM attendance_days WHERE member_id = m.id AND work_date = d;
                    IF FOUND AND v_day.status IN ('present', 'late') THEN
                        v_pts := v_pts + least(
                            CASE WHEN v_day.status = 'late' THEN s.points_late ELSE 1 END,
                            CASE WHEN v_day.auto_checked_out THEN s.points_missing_checkout ELSE 1 END);
                    END IF;                                 -- absent / no row: 0
                END IF;
            END IF;
            d := d + 1;
        END LOOP;
        v_att := CASE WHEN v_w > 0 THEN round(100 * v_pts / v_w, 2) END;

        -- B. ratings (last 12 months, smoothed toward the org average)
        SELECT count(*), coalesce(sum(stars), 0) INTO v_cnt, v_sum FROM project_ratings
         WHERE ratee_member_id = m.id AND created_at >= p_as_of - interval '12 months';
        IF v_cnt >= s.rating_min_count THEN
            v_avg := (s.rating_prior_weight * v_orgavg + v_sum) / (s.rating_prior_weight + v_cnt);
            v_rat := round((v_avg - 1) / 4 * 100, 2);
        ELSE
            v_avg := NULL; v_rat := NULL;
        END IF;

        -- C. on-time tasks: done in window + still open past due
        SELECT count(*) FILTER (WHERE t.status = 'done' AND t.completed_at::date BETWEEN v_start AND p_as_of)
             + count(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_at::date <= p_as_of),
               count(*) FILTER (WHERE t.status = 'done' AND t.completed_at::date BETWEEN v_start AND p_as_of
                                  AND t.completed_at <= t.due_at)
          INTO v_tot, v_ok
          FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
         WHERE ta.member_id = m.id AND ta.removed_at IS NULL;
        v_ont := CASE WHEN v_tot > 0 THEN round(100.0 * v_ok / v_tot, 2) END;

        -- D. early bonus: +1 for every task finished strictly before its deadline (window as above),
        --    for each manager and employee assigned to it
        SELECT count(*) INTO v_early
          FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
         WHERE ta.member_id = m.id AND ta.removed_at IS NULL
           AND t.status = 'done' AND t.completed_at::date BETWEEN v_start AND p_as_of
           AND t.completed_at < t.due_at;

        -- final: weights re-shared across the inputs that exist
        v_wsum := (CASE WHEN v_att IS NOT NULL THEN s.weight_attendance ELSE 0 END)
                + (CASE WHEN v_rat IS NOT NULL THEN s.weight_rating ELSE 0 END)
                + (CASE WHEN v_ont IS NOT NULL THEN s.weight_ontime ELSE 0 END);
        IF v_wsum > 0 THEN
            v_final := round(( coalesce(v_att, 0) * CASE WHEN v_att IS NOT NULL THEN s.weight_attendance ELSE 0 END
                             + coalesce(v_rat, 0) * CASE WHEN v_rat IS NOT NULL THEN s.weight_rating ELSE 0 END
                             + coalesce(v_ont, 0) * CASE WHEN v_ont IS NOT NULL THEN s.weight_ontime ELSE 0 END) / v_wsum, 2);
            v_final := least(100, v_final + v_early);        -- the early bonus, capped at 100
            v_band := CASE WHEN v_final >= 85 THEN 'excellent' WHEN v_final >= 70 THEN 'good'
                           WHEN v_final >= 50 THEN 'needs_attention' ELSE 'poor' END;
        ELSE
            v_final := NULL; v_band := NULL;
        END IF;

        INSERT INTO performance_scores (org_id, member_id, computed_on, window_start, working_days, attendance_points,
                                        attendance_score, rating_count, rating_avg, rating_score,
                                        ontime_total, ontime_on_time, ontime_score, final_score, band, is_new, has_ratings, early_tasks)
        VALUES (p_org, m.id, p_as_of, v_start, v_w, v_pts, v_att, v_cnt, v_avg, v_rat,
                v_tot, v_ok, v_ont, v_final, v_band,
                m.joined_at > (p_as_of - 30)::timestamptz, v_cnt >= s.rating_min_count, v_early)
        ON CONFLICT (member_id, computed_on) DO UPDATE SET
            working_days = EXCLUDED.working_days, attendance_points = EXCLUDED.attendance_points,
            attendance_score = EXCLUDED.attendance_score, rating_count = EXCLUDED.rating_count,
            rating_avg = EXCLUDED.rating_avg, rating_score = EXCLUDED.rating_score,
            ontime_total = EXCLUDED.ontime_total, ontime_on_time = EXCLUDED.ontime_on_time,
            ontime_score = EXCLUDED.ontime_score, final_score = EXCLUDED.final_score,
            band = EXCLUDED.band, is_new = EXCLUDED.is_new, has_ratings = EXCLUDED.has_ratings,
            early_tasks = EXCLUDED.early_tasks;
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;

COMMIT;

-- ===== BEGIN docs/hrms/0015_messaging.sql =====
-- =====================================================================
-- 0015: internal messaging and anonymous reports.
--
-- Who may message whom (two-way, one person to one person):
--   gameMaster <-> CEO, gameMaster <-> COO, CEO <-> COO,
--   CEO <-> manager, COO <-> manager, COO <-> employee.
-- Reports go from a COO, manager or employee to a CEO and may be
-- anonymous: the sender is stored apart and is only readable by the
-- sender through my_reports(). Nothing else ever returns it.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

-- ---- the hierarchy, in one place --------------------------------------
CREATE FUNCTION messaging_pair_allowed(a text, b text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT (least(a COLLATE "C", b COLLATE "C"), greatest(a COLLATE "C", b COLLATE "C")) IN (
        ('ceo', 'gameMaster'), ('coo', 'gameMaster'), ('ceo', 'coo'),
        ('ceo', 'manager'), ('coo', 'manager'), ('coo', 'employee'))
$$;

-- A person's messaging role: gameMaster, or their active role in the org. NULL when inactive.
CREATE FUNCTION message_role_of(p_user uuid, p_org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM game_masters WHERE user_id = p_user AND status = 'active') THEN 'gameMaster'
        ELSE (SELECT m.role::text FROM org_members m
               WHERE m.user_id = p_user AND m.org_id = p_org AND m.status = 'active')
    END
$$;

-- ---- conversations and messages ---------------------------------------
CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES orgs(id),
    user_lo         uuid NOT NULL REFERENCES users(id),
    user_hi         uuid NOT NULL REFERENCES users(id),
    created_by      uuid NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    CHECK (user_lo < user_hi),
    CHECK (created_by IN (user_lo, user_hi)),
    UNIQUE (org_id, user_lo, user_hi)
);
CREATE INDEX conversations_lo_idx ON conversations (user_lo, last_message_at DESC);
CREATE INDEX conversations_hi_idx ON conversations (user_hi, last_message_at DESC);

CREATE TABLE messages (
    id              bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    org_id          uuid NOT NULL,
    sender_user     uuid NOT NULL REFERENCES users(id),
    body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    sent_at         timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id);

-- "Delete for me": hides a message from one person only.
CREATE TABLE message_hidden (
    message_id bigint NOT NULL REFERENCES messages(id),
    user_id    uuid   NOT NULL REFERENCES users(id),
    PRIMARY KEY (message_id, user_id)
);

CREATE FUNCTION trg_conversation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lo text; v_hi text;
BEGIN
    v_lo := message_role_of(NEW.user_lo, NEW.org_id);
    v_hi := message_role_of(NEW.user_hi, NEW.org_id);
    IF v_lo IS NULL OR v_hi IS NULL OR NOT messaging_pair_allowed(v_lo, v_hi) THEN
        RAISE EXCEPTION 'You cannot message this person.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM current_user_id() THEN
        RAISE EXCEPTION 'A conversation is started by one of its two people.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER conversation_guard BEFORE INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION trg_conversation_guard();

CREATE FUNCTION trg_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c conversations%ROWTYPE; v_lo text; v_hi text; v_status org_status;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Messages cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        -- only read_at moves, and only by the person who received it
        IF NEW.body IS DISTINCT FROM OLD.body OR NEW.sender_user IS DISTINCT FROM OLD.sender_user
           OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
            RAISE EXCEPTION 'Messages cannot be edited';
        END IF;
        IF current_user_id() IS NOT NULL AND current_user_id() = OLD.sender_user THEN
            RAISE EXCEPTION 'Only the person who received a message marks it read';
        END IF;
        RETURN NEW;
    END IF;

    SELECT * INTO c FROM conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND OR c.org_id <> NEW.org_id THEN RAISE EXCEPTION 'Conversation not found'; END IF;
    IF NEW.sender_user NOT IN (c.user_lo, c.user_hi) THEN
        RAISE EXCEPTION 'You are not part of this conversation';
    END IF;
    IF NEW.sender_user IS DISTINCT FROM current_user_id() THEN
        RAISE EXCEPTION 'You can only send your own messages';
    END IF;
    v_lo := message_role_of(c.user_lo, c.org_id);
    v_hi := message_role_of(c.user_hi, c.org_id);
    IF v_lo IS NULL OR v_hi IS NULL THEN
        RAISE EXCEPTION 'This conversation is closed because one person is no longer active.';
    END IF;
    IF NOT messaging_pair_allowed(v_lo, v_hi) THEN RAISE EXCEPTION 'You cannot message this person.'; END IF;
    SELECT status INTO v_status FROM orgs WHERE id = c.org_id;
    IF v_status = 'read_only' AND v_lo <> 'gameMaster' AND v_hi <> 'gameMaster' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER message_guard BEFORE INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION trg_message_guard();

CREATE FUNCTION trg_message_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE conversations SET last_message_at = NEW.sent_at WHERE id = NEW.conversation_id;
    RETURN NEW;
END $$;
CREATE TRIGGER message_touch AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION trg_message_touch();

-- ---- reports -----------------------------------------------------------
CREATE TABLE reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES orgs(id),
    ceo_user        uuid NOT NULL REFERENCES users(id),
    subject         text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
    is_anonymous    boolean NOT NULL,
    reporter_name   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    CHECK (is_anonymous = (reporter_name IS NULL))
);
CREATE INDEX reports_ceo_idx ON reports (ceo_user, last_message_at DESC);

CREATE TABLE report_messages (
    id            bigserial PRIMARY KEY,
    report_id     uuid NOT NULL REFERENCES reports(id),
    org_id        uuid NOT NULL,
    from_reporter boolean NOT NULL,
    body          text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    sent_at       timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz
);
CREATE INDEX report_messages_report_idx ON report_messages (report_id, id);

-- The sender, kept apart. The app role has no access to this table.
CREATE TABLE report_senders (
    report_id   uuid PRIMARY KEY REFERENCES reports(id),
    org_id      uuid NOT NULL,
    sender_user uuid NOT NULL REFERENCES users(id)
);

-- ---- row-level security -------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY participants ON conversations
    USING (org_id = current_org_id() AND current_user_id() IN (user_lo, user_hi))
    WITH CHECK (org_id = current_org_id() AND current_user_id() IN (user_lo, user_hi));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY participants ON messages
    USING (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND current_user_id() IN (c.user_lo, c.user_hi)))
    WITH CHECK (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND current_user_id() IN (c.user_lo, c.user_hi)));

ALTER TABLE message_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON message_hidden USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipient_ceo ON reports FOR SELECT
    USING (org_id = current_org_id() AND ceo_user = current_user_id());
ALTER TABLE report_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipient_ceo ON report_messages FOR SELECT
    USING (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM reports r WHERE r.id = report_id AND r.ceo_user = current_user_id()));
ALTER TABLE report_senders ENABLE ROW LEVEL SECURITY;   -- no policy: nobody but the owner

GRANT SELECT, INSERT, UPDATE ON conversations, messages TO hrms_app;
GRANT USAGE ON SEQUENCE messages_id_seq TO hrms_app;
GRANT SELECT, INSERT ON message_hidden TO hrms_app;
GRANT SELECT ON reports, report_messages TO hrms_app;
-- report_senders: no grant to the app role at all

-- ---- reports: every write goes through a function ------------------------
CREATE FUNCTION file_report(p_ceo_user uuid, p_subject text, p_body text, p_anonymous boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_org uuid := current_org_id(); v_me uuid := current_user_id(); v_role text; v_id uuid; v_status org_status;
BEGIN
    IF v_org IS NULL OR v_me IS NULL THEN RAISE EXCEPTION 'Sign in to an organisation first.'; END IF;
    v_role := message_role_of(v_me, v_org);
    IF v_role IS NULL OR v_role NOT IN ('coo', 'manager', 'employee') THEN
        RAISE EXCEPTION 'Only a COO, manager or employee can send a report to the CEO.';
    END IF;
    IF message_role_of(p_ceo_user, v_org) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Reports go to a CEO of your organisation.';
    END IF;
    SELECT status INTO v_status FROM orgs WHERE id = v_org;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    v_id := gen_random_uuid();
    INSERT INTO reports (id, org_id, ceo_user, subject, is_anonymous, reporter_name)
    VALUES (v_id, v_org, p_ceo_user, p_subject, p_anonymous,
            CASE WHEN p_anonymous THEN NULL ELSE (SELECT full_name FROM users WHERE id = v_me) END);
    INSERT INTO report_senders (report_id, org_id, sender_user) VALUES (v_id, v_org, v_me);
    INSERT INTO report_messages (report_id, org_id, from_reporter, body) VALUES (v_id, v_org, true, p_body);
    RETURN v_id;
END $$;

CREATE FUNCTION report_reply_as_reporter(p_report uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE s report_senders%ROWTYPE; v_id bigint; v_status org_status;
BEGIN
    SELECT * INTO s FROM report_senders WHERE report_id = p_report AND sender_user = current_user_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF s.org_id IS DISTINCT FROM current_org_id() THEN RAISE EXCEPTION 'Report not found.'; END IF;
    SELECT status INTO v_status FROM orgs WHERE id = s.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, s.org_id, true, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report;
    RETURN v_id;
END $$;

CREATE FUNCTION report_reply_as_ceo(p_report uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE r reports%ROWTYPE; v_id bigint; v_status org_status;
BEGIN
    SELECT * INTO r FROM reports WHERE id = p_report AND ceo_user = current_user_id() AND org_id = current_org_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF message_role_of(current_user_id(), r.org_id) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Only a CEO can answer a report.';
    END IF;
    SELECT status INTO v_status FROM orgs WHERE id = r.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, r.org_id, false, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report;
    RETURN v_id;
END $$;

-- The sender's own reports (and only theirs).
CREATE FUNCTION my_reports()
RETURNS TABLE (report_id uuid, subject text, is_anonymous boolean, created_at timestamptz,
               last_message_at timestamptz, unread integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT r.id, r.subject, r.is_anonymous, r.created_at, r.last_message_at,
           (SELECT count(*)::int FROM report_messages m
             WHERE m.report_id = r.id AND NOT m.from_reporter AND m.read_at IS NULL)
      FROM report_senders s JOIN reports r ON r.id = s.report_id
     WHERE s.sender_user = current_user_id() AND s.org_id = current_org_id()
     ORDER BY r.last_message_at DESC
$$;

CREATE FUNCTION my_report_thread(p_report uuid)
RETURNS TABLE (id bigint, from_reporter boolean, body text, sent_at timestamptz, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT m.id, m.from_reporter, m.body, m.sent_at, m.read_at
      FROM report_senders s JOIN report_messages m ON m.report_id = s.report_id
     WHERE s.report_id = p_report AND s.sender_user = current_user_id() AND s.org_id = current_org_id()
     ORDER BY m.id
$$;

-- Marks the other side's messages read. The CEO marks the reporter's; the reporter, the CEO's.
CREATE FUNCTION report_mark_read(p_report uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM reports WHERE id = p_report AND ceo_user = current_user_id() AND org_id = current_org_id()) THEN
        UPDATE report_messages SET read_at = now() WHERE report_id = p_report AND from_reporter AND read_at IS NULL;
    ELSIF EXISTS (SELECT 1 FROM report_senders WHERE report_id = p_report AND sender_user = current_user_id()
                    AND org_id = current_org_id()) THEN
        UPDATE report_messages SET read_at = now() WHERE report_id = p_report AND NOT from_reporter AND read_at IS NULL;
    END IF;
END $$;

-- ---- gameMasters: they have no organisation, so everything is a function --
CREATE FUNCTION list_game_masters() RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF message_role_of(current_user_id(), current_org_id()) NOT IN ('ceo', 'coo') THEN
        RAISE EXCEPTION 'Only a CEO or COO can contact the platform team.';
    END IF;
    RETURN QUERY SELECT g.user_id, u.full_name FROM game_masters g JOIN users u ON u.id = g.user_id
                  WHERE g.status = 'active' ORDER BY u.full_name;
END $$;

CREATE FUNCTION gm_message_threads()
RETURNS TABLE (conversation_id uuid, org_id uuid, org_name text, other_user uuid, other_name text,
               other_role text, last_message_at timestamptz, last_body text, unread integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT c.id, c.org_id, o.name,
           CASE WHEN c.user_lo = current_user_id() THEN c.user_hi ELSE c.user_lo END,
           u.full_name, message_role_of(u.id, c.org_id), c.last_message_at,
           (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1),
           (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id
               AND m.sender_user <> current_user_id() AND m.read_at IS NULL)
      FROM conversations c JOIN orgs o ON o.id = c.org_id
      JOIN users u ON u.id = CASE WHEN c.user_lo = current_user_id() THEN c.user_hi ELSE c.user_lo END
     WHERE current_user_id() IN (c.user_lo, c.user_hi)
     ORDER BY c.last_message_at DESC;
END $$;

CREATE FUNCTION gm_message_thread(p_conversation uuid)
RETURNS TABLE (id bigint, sender_user uuid, body text, sent_at timestamptz, read_at timestamptz, mine boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT m.id, m.sender_user, m.body, m.sent_at, m.read_at, m.sender_user = current_user_id()
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = p_conversation AND current_user_id() IN (c.user_lo, c.user_hi)
       AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = current_user_id())
     ORDER BY m.id;
END $$;

CREATE FUNCTION gm_message_send(p_conversation uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE c conversations%ROWTYPE; v_id bigint;
BEGIN
    PERFORM gm_assert();
    SELECT * INTO c FROM conversations WHERE id = p_conversation AND current_user_id() IN (user_lo, user_hi);
    IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
    INSERT INTO messages (conversation_id, org_id, sender_user, body)
    VALUES (c.id, c.org_id, current_user_id(), p_body) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- A gameMaster starts (or continues) a conversation with a CEO or COO of an organisation.
CREATE FUNCTION gm_message_start(p_org uuid, p_user uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_lo uuid; v_hi uuid; v_conv uuid;
BEGIN
    PERFORM gm_assert();
    IF message_role_of(p_user, p_org) NOT IN ('ceo', 'coo') THEN
        RAISE EXCEPTION 'A gameMaster can message a CEO or COO of an organisation.';
    END IF;
    v_lo := least(current_user_id(), p_user); v_hi := greatest(current_user_id(), p_user);
    SELECT id INTO v_conv FROM conversations WHERE org_id = p_org AND user_lo = v_lo AND user_hi = v_hi;
    IF v_conv IS NULL THEN
        INSERT INTO conversations (org_id, user_lo, user_hi, created_by)
        VALUES (p_org, v_lo, v_hi, current_user_id()) RETURNING id INTO v_conv;
    END IF;
    INSERT INTO messages (conversation_id, org_id, sender_user, body) VALUES (v_conv, p_org, current_user_id(), p_body);
    RETURN v_conv;
END $$;

CREATE FUNCTION gm_message_mark_read(p_conversation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    UPDATE messages m SET read_at = now()
      FROM conversations c
     WHERE m.conversation_id = c.id AND c.id = p_conversation AND current_user_id() IN (c.user_lo, c.user_hi)
       AND m.sender_user <> current_user_id() AND m.read_at IS NULL;
END $$;

-- Organisations a gameMaster may start a conversation in, with their CEOs and COOs.
CREATE FUNCTION gm_message_contacts(p_query text DEFAULT NULL)
RETURNS TABLE (org_id uuid, org_name text, user_id uuid, full_name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT o.id, o.name, u.id, u.full_name, m.role::text
      FROM org_members m JOIN orgs o ON o.id = m.org_id JOIN users u ON u.id = m.user_id
     WHERE m.status = 'active' AND m.role IN ('ceo', 'coo')
       AND (p_query IS NULL OR u.full_name ILIKE '%' || p_query || '%' OR o.name ILIKE '%' || p_query || '%')
     ORDER BY u.full_name LIMIT 4;
END $$;

GRANT EXECUTE ON FUNCTION file_report, report_reply_as_reporter, report_reply_as_ceo, my_reports,
    my_report_thread, report_mark_read, list_game_masters, gm_message_threads, gm_message_thread,
    gm_message_send, gm_message_start, gm_message_mark_read, gm_message_contacts,
    message_role_of, messaging_pair_allowed TO hrms_app;

COMMIT;

-- ===== BEGIN docs/hrms/0016_report_reply_returns_reporter.sql =====
-- =====================================================================
-- 0016: the CEO's report reply tells the server which user to push the
-- real-time event to. The id stays on the server: it is never put in
-- an API response.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

DROP FUNCTION report_reply_as_ceo(uuid, text);
CREATE FUNCTION report_reply_as_ceo(p_report uuid, p_body text)
RETURNS TABLE (message_id bigint, reporter_user uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE r reports%ROWTYPE; v_id bigint; v_status org_status; v_reporter uuid;
BEGIN
    SELECT * INTO r FROM reports WHERE id = p_report AND ceo_user = current_user_id() AND org_id = current_org_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF message_role_of(current_user_id(), r.org_id) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Only a CEO can answer a report.';
    END IF;
    SELECT status INTO v_status FROM orgs WHERE id = r.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, r.org_id, false, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report;
    SELECT sender_user INTO v_reporter FROM report_senders WHERE report_id = p_report;
    RETURN QUERY SELECT v_id, v_reporter;
END $$;

GRANT EXECUTE ON FUNCTION report_reply_as_ceo TO hrms_app;
COMMIT;

-- ===== BEGIN docs/hrms/0017_report_reply_returns_ceo.sql =====
-- =====================================================================
-- 0017: a reporter's reply also returns the CEO's user id, so the server
-- can push the real-time event. The reporter cannot read the report row.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

DROP FUNCTION report_reply_as_reporter(uuid, text);
CREATE FUNCTION report_reply_as_reporter(p_report uuid, p_body text)
RETURNS TABLE (message_id bigint, ceo_user uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE s report_senders%ROWTYPE; v_id bigint; v_status org_status; v_ceo uuid;
BEGIN
    SELECT * INTO s FROM report_senders WHERE report_id = p_report AND sender_user = current_user_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF s.org_id IS DISTINCT FROM current_org_id() THEN RAISE EXCEPTION 'Report not found.'; END IF;
    SELECT status INTO v_status FROM orgs WHERE id = s.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, s.org_id, true, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report RETURNING reports.ceo_user INTO v_ceo;
    RETURN QUERY SELECT v_id, v_ceo;
END $$;

GRANT EXECUTE ON FUNCTION report_reply_as_reporter TO hrms_app;
COMMIT;

-- ===== BEGIN docs/hrms/0018_report_replies_return_id_only.sql =====
-- =====================================================================
-- 0018: messaging no longer pushes events, so a report reply returns
-- only its own id again. The sender's id stays inside the database.
-- (Undoes the return values added in 0016 and 0017.)
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

DROP FUNCTION report_reply_as_ceo(uuid, text);
CREATE FUNCTION report_reply_as_ceo(p_report uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE r reports%ROWTYPE; v_id bigint; v_status org_status;
BEGIN
    SELECT * INTO r FROM reports WHERE id = p_report AND ceo_user = current_user_id() AND org_id = current_org_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF message_role_of(current_user_id(), r.org_id) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Only a CEO can answer a report.';
    END IF;
    SELECT status INTO v_status FROM orgs WHERE id = r.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, r.org_id, false, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report;
    RETURN v_id;
END $$;

DROP FUNCTION report_reply_as_reporter(uuid, text);
CREATE FUNCTION report_reply_as_reporter(p_report uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE s report_senders%ROWTYPE; v_id bigint; v_status org_status;
BEGIN
    SELECT * INTO s FROM report_senders WHERE report_id = p_report AND sender_user = current_user_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
    IF s.org_id IS DISTINCT FROM current_org_id() THEN RAISE EXCEPTION 'Report not found.'; END IF;
    SELECT status INTO v_status FROM orgs WHERE id = s.org_id;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    INSERT INTO report_messages (report_id, org_id, from_reporter, body)
    VALUES (p_report, s.org_id, true, p_body) RETURNING id INTO v_id;
    UPDATE reports SET last_message_at = now() WHERE id = p_report;
    RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION report_reply_as_ceo, report_reply_as_reporter TO hrms_app;
COMMIT;
