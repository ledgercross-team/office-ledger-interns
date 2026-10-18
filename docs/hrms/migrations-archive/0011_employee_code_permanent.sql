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
