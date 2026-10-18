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
