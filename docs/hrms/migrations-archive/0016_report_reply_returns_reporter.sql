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
