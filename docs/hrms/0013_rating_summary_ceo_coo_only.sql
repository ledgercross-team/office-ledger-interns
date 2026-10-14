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
