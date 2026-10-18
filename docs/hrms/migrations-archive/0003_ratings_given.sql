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
