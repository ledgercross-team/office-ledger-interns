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
