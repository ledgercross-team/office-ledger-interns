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
