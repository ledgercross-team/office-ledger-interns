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
