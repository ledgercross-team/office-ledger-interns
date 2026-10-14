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
