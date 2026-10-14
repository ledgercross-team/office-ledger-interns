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
