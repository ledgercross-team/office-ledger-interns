-- =====================================================================
-- 0015: internal messaging and anonymous reports.
--
-- Who may message whom (two-way, one person to one person):
--   gameMaster <-> CEO, gameMaster <-> COO, CEO <-> COO,
--   CEO <-> manager, COO <-> manager, COO <-> employee.
-- Reports go from a COO, manager or employee to a CEO and may be
-- anonymous: the sender is stored apart and is only readable by the
-- sender through my_reports(). Nothing else ever returns it.
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

-- ---- the hierarchy, in one place --------------------------------------
CREATE FUNCTION messaging_pair_allowed(a text, b text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT (least(a COLLATE "C", b COLLATE "C"), greatest(a COLLATE "C", b COLLATE "C")) IN (
        ('ceo', 'gameMaster'), ('coo', 'gameMaster'), ('ceo', 'coo'),
        ('ceo', 'manager'), ('coo', 'manager'), ('coo', 'employee'))
$$;

-- A person's messaging role: gameMaster, or their active role in the org. NULL when inactive.
CREATE FUNCTION message_role_of(p_user uuid, p_org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM game_masters WHERE user_id = p_user AND status = 'active') THEN 'gameMaster'
        ELSE (SELECT m.role::text FROM org_members m
               WHERE m.user_id = p_user AND m.org_id = p_org AND m.status = 'active')
    END
$$;

-- ---- conversations and messages ---------------------------------------
CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES orgs(id),
    user_lo         uuid NOT NULL REFERENCES users(id),
    user_hi         uuid NOT NULL REFERENCES users(id),
    created_by      uuid NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    CHECK (user_lo < user_hi),
    CHECK (created_by IN (user_lo, user_hi)),
    UNIQUE (org_id, user_lo, user_hi)
);
CREATE INDEX conversations_lo_idx ON conversations (user_lo, last_message_at DESC);
CREATE INDEX conversations_hi_idx ON conversations (user_hi, last_message_at DESC);

CREATE TABLE messages (
    id              bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    org_id          uuid NOT NULL,
    sender_user     uuid NOT NULL REFERENCES users(id),
    body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    sent_at         timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id);

-- "Delete for me": hides a message from one person only.
CREATE TABLE message_hidden (
    message_id bigint NOT NULL REFERENCES messages(id),
    user_id    uuid   NOT NULL REFERENCES users(id),
    PRIMARY KEY (message_id, user_id)
);

CREATE FUNCTION trg_conversation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lo text; v_hi text;
BEGIN
    v_lo := message_role_of(NEW.user_lo, NEW.org_id);
    v_hi := message_role_of(NEW.user_hi, NEW.org_id);
    IF v_lo IS NULL OR v_hi IS NULL OR NOT messaging_pair_allowed(v_lo, v_hi) THEN
        RAISE EXCEPTION 'You cannot message this person.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM current_user_id() THEN
        RAISE EXCEPTION 'A conversation is started by one of its two people.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER conversation_guard BEFORE INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION trg_conversation_guard();

CREATE FUNCTION trg_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c conversations%ROWTYPE; v_lo text; v_hi text; v_status org_status;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Messages cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        -- only read_at moves, and only by the person who received it
        IF NEW.body IS DISTINCT FROM OLD.body OR NEW.sender_user IS DISTINCT FROM OLD.sender_user
           OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
            RAISE EXCEPTION 'Messages cannot be edited';
        END IF;
        IF current_user_id() IS NOT NULL AND current_user_id() = OLD.sender_user THEN
            RAISE EXCEPTION 'Only the person who received a message marks it read';
        END IF;
        RETURN NEW;
    END IF;

    SELECT * INTO c FROM conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND OR c.org_id <> NEW.org_id THEN RAISE EXCEPTION 'Conversation not found'; END IF;
    IF NEW.sender_user NOT IN (c.user_lo, c.user_hi) THEN
        RAISE EXCEPTION 'You are not part of this conversation';
    END IF;
    IF NEW.sender_user IS DISTINCT FROM current_user_id() THEN
        RAISE EXCEPTION 'You can only send your own messages';
    END IF;
    v_lo := message_role_of(c.user_lo, c.org_id);
    v_hi := message_role_of(c.user_hi, c.org_id);
    IF v_lo IS NULL OR v_hi IS NULL THEN
        RAISE EXCEPTION 'This conversation is closed because one person is no longer active.';
    END IF;
    IF NOT messaging_pair_allowed(v_lo, v_hi) THEN RAISE EXCEPTION 'You cannot message this person.'; END IF;
    SELECT status INTO v_status FROM orgs WHERE id = c.org_id;
    IF v_status = 'read_only' AND v_lo <> 'gameMaster' AND v_hi <> 'gameMaster' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER message_guard BEFORE INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION trg_message_guard();

CREATE FUNCTION trg_message_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE conversations SET last_message_at = NEW.sent_at WHERE id = NEW.conversation_id;
    RETURN NEW;
END $$;
CREATE TRIGGER message_touch AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION trg_message_touch();

-- ---- reports -----------------------------------------------------------
CREATE TABLE reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES orgs(id),
    ceo_user        uuid NOT NULL REFERENCES users(id),
    subject         text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
    is_anonymous    boolean NOT NULL,
    reporter_name   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    CHECK (is_anonymous = (reporter_name IS NULL))
);
CREATE INDEX reports_ceo_idx ON reports (ceo_user, last_message_at DESC);

CREATE TABLE report_messages (
    id            bigserial PRIMARY KEY,
    report_id     uuid NOT NULL REFERENCES reports(id),
    org_id        uuid NOT NULL,
    from_reporter boolean NOT NULL,
    body          text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    sent_at       timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz
);
CREATE INDEX report_messages_report_idx ON report_messages (report_id, id);

-- The sender, kept apart. The app role has no access to this table.
CREATE TABLE report_senders (
    report_id   uuid PRIMARY KEY REFERENCES reports(id),
    org_id      uuid NOT NULL,
    sender_user uuid NOT NULL REFERENCES users(id)
);

-- ---- row-level security -------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY participants ON conversations
    USING (org_id = current_org_id() AND current_user_id() IN (user_lo, user_hi))
    WITH CHECK (org_id = current_org_id() AND current_user_id() IN (user_lo, user_hi));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY participants ON messages
    USING (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND current_user_id() IN (c.user_lo, c.user_hi)))
    WITH CHECK (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND current_user_id() IN (c.user_lo, c.user_hi)));

ALTER TABLE message_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON message_hidden USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipient_ceo ON reports FOR SELECT
    USING (org_id = current_org_id() AND ceo_user = current_user_id());
ALTER TABLE report_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipient_ceo ON report_messages FOR SELECT
    USING (org_id = current_org_id() AND EXISTS (
        SELECT 1 FROM reports r WHERE r.id = report_id AND r.ceo_user = current_user_id()));
ALTER TABLE report_senders ENABLE ROW LEVEL SECURITY;   -- no policy: nobody but the owner

GRANT SELECT, INSERT, UPDATE ON conversations, messages TO hrms_app;
GRANT USAGE ON SEQUENCE messages_id_seq TO hrms_app;
GRANT SELECT, INSERT ON message_hidden TO hrms_app;
GRANT SELECT ON reports, report_messages TO hrms_app;
-- report_senders: no grant to the app role at all

-- ---- reports: every write goes through a function ------------------------
CREATE FUNCTION file_report(p_ceo_user uuid, p_subject text, p_body text, p_anonymous boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_org uuid := current_org_id(); v_me uuid := current_user_id(); v_role text; v_id uuid; v_status org_status;
BEGIN
    IF v_org IS NULL OR v_me IS NULL THEN RAISE EXCEPTION 'Sign in to an organisation first.'; END IF;
    v_role := message_role_of(v_me, v_org);
    IF v_role IS NULL OR v_role NOT IN ('coo', 'manager', 'employee') THEN
        RAISE EXCEPTION 'Only a COO, manager or employee can send a report to the CEO.';
    END IF;
    IF message_role_of(p_ceo_user, v_org) IS DISTINCT FROM 'ceo' THEN
        RAISE EXCEPTION 'Reports go to a CEO of your organisation.';
    END IF;
    SELECT status INTO v_status FROM orgs WHERE id = v_org;
    IF v_status = 'read_only' THEN
        RAISE EXCEPTION 'This organisation is read-only until the subscription is renewed.';
    END IF;
    v_id := gen_random_uuid();
    INSERT INTO reports (id, org_id, ceo_user, subject, is_anonymous, reporter_name)
    VALUES (v_id, v_org, p_ceo_user, p_subject, p_anonymous,
            CASE WHEN p_anonymous THEN NULL ELSE (SELECT full_name FROM users WHERE id = v_me) END);
    INSERT INTO report_senders (report_id, org_id, sender_user) VALUES (v_id, v_org, v_me);
    INSERT INTO report_messages (report_id, org_id, from_reporter, body) VALUES (v_id, v_org, true, p_body);
    RETURN v_id;
END $$;

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

-- The sender's own reports (and only theirs).
CREATE FUNCTION my_reports()
RETURNS TABLE (report_id uuid, subject text, is_anonymous boolean, created_at timestamptz,
               last_message_at timestamptz, unread integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT r.id, r.subject, r.is_anonymous, r.created_at, r.last_message_at,
           (SELECT count(*)::int FROM report_messages m
             WHERE m.report_id = r.id AND NOT m.from_reporter AND m.read_at IS NULL)
      FROM report_senders s JOIN reports r ON r.id = s.report_id
     WHERE s.sender_user = current_user_id() AND s.org_id = current_org_id()
     ORDER BY r.last_message_at DESC
$$;

CREATE FUNCTION my_report_thread(p_report uuid)
RETURNS TABLE (id bigint, from_reporter boolean, body text, sent_at timestamptz, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
    SELECT m.id, m.from_reporter, m.body, m.sent_at, m.read_at
      FROM report_senders s JOIN report_messages m ON m.report_id = s.report_id
     WHERE s.report_id = p_report AND s.sender_user = current_user_id() AND s.org_id = current_org_id()
     ORDER BY m.id
$$;

-- Marks the other side's messages read. The CEO marks the reporter's; the reporter, the CEO's.
CREATE FUNCTION report_mark_read(p_report uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM reports WHERE id = p_report AND ceo_user = current_user_id() AND org_id = current_org_id()) THEN
        UPDATE report_messages SET read_at = now() WHERE report_id = p_report AND from_reporter AND read_at IS NULL;
    ELSIF EXISTS (SELECT 1 FROM report_senders WHERE report_id = p_report AND sender_user = current_user_id()
                    AND org_id = current_org_id()) THEN
        UPDATE report_messages SET read_at = now() WHERE report_id = p_report AND NOT from_reporter AND read_at IS NULL;
    END IF;
END $$;

-- ---- gameMasters: they have no organisation, so everything is a function --
CREATE FUNCTION list_game_masters() RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    IF message_role_of(current_user_id(), current_org_id()) NOT IN ('ceo', 'coo') THEN
        RAISE EXCEPTION 'Only a CEO or COO can contact the platform team.';
    END IF;
    RETURN QUERY SELECT g.user_id, u.full_name FROM game_masters g JOIN users u ON u.id = g.user_id
                  WHERE g.status = 'active' ORDER BY u.full_name;
END $$;

CREATE FUNCTION gm_message_threads()
RETURNS TABLE (conversation_id uuid, org_id uuid, org_name text, other_user uuid, other_name text,
               other_role text, last_message_at timestamptz, last_body text, unread integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT c.id, c.org_id, o.name,
           CASE WHEN c.user_lo = current_user_id() THEN c.user_hi ELSE c.user_lo END,
           u.full_name, message_role_of(u.id, c.org_id), c.last_message_at,
           (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1),
           (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id
               AND m.sender_user <> current_user_id() AND m.read_at IS NULL)
      FROM conversations c JOIN orgs o ON o.id = c.org_id
      JOIN users u ON u.id = CASE WHEN c.user_lo = current_user_id() THEN c.user_hi ELSE c.user_lo END
     WHERE current_user_id() IN (c.user_lo, c.user_hi)
     ORDER BY c.last_message_at DESC;
END $$;

CREATE FUNCTION gm_message_thread(p_conversation uuid)
RETURNS TABLE (id bigint, sender_user uuid, body text, sent_at timestamptz, read_at timestamptz, mine boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT m.id, m.sender_user, m.body, m.sent_at, m.read_at, m.sender_user = current_user_id()
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = p_conversation AND current_user_id() IN (c.user_lo, c.user_hi)
       AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = current_user_id())
     ORDER BY m.id;
END $$;

CREATE FUNCTION gm_message_send(p_conversation uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE c conversations%ROWTYPE; v_id bigint;
BEGIN
    PERFORM gm_assert();
    SELECT * INTO c FROM conversations WHERE id = p_conversation AND current_user_id() IN (user_lo, user_hi);
    IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
    INSERT INTO messages (conversation_id, org_id, sender_user, body)
    VALUES (c.id, c.org_id, current_user_id(), p_body) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- A gameMaster starts (or continues) a conversation with a CEO or COO of an organisation.
CREATE FUNCTION gm_message_start(p_org uuid, p_user uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
DECLARE v_lo uuid; v_hi uuid; v_conv uuid;
BEGIN
    PERFORM gm_assert();
    IF message_role_of(p_user, p_org) NOT IN ('ceo', 'coo') THEN
        RAISE EXCEPTION 'A gameMaster can message a CEO or COO of an organisation.';
    END IF;
    v_lo := least(current_user_id(), p_user); v_hi := greatest(current_user_id(), p_user);
    SELECT id INTO v_conv FROM conversations WHERE org_id = p_org AND user_lo = v_lo AND user_hi = v_hi;
    IF v_conv IS NULL THEN
        INSERT INTO conversations (org_id, user_lo, user_hi, created_by)
        VALUES (p_org, v_lo, v_hi, current_user_id()) RETURNING id INTO v_conv;
    END IF;
    INSERT INTO messages (conversation_id, org_id, sender_user, body) VALUES (v_conv, p_org, current_user_id(), p_body);
    RETURN v_conv;
END $$;

CREATE FUNCTION gm_message_mark_read(p_conversation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    UPDATE messages m SET read_at = now()
      FROM conversations c
     WHERE m.conversation_id = c.id AND c.id = p_conversation AND current_user_id() IN (c.user_lo, c.user_hi)
       AND m.sender_user <> current_user_id() AND m.read_at IS NULL;
END $$;

-- Organisations a gameMaster may start a conversation in, with their CEOs and COOs.
CREATE FUNCTION gm_message_contacts(p_query text DEFAULT NULL)
RETURNS TABLE (org_id uuid, org_name text, user_id uuid, full_name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = hrms, public AS $$
BEGIN
    PERFORM gm_assert();
    RETURN QUERY
    SELECT o.id, o.name, u.id, u.full_name, m.role::text
      FROM org_members m JOIN orgs o ON o.id = m.org_id JOIN users u ON u.id = m.user_id
     WHERE m.status = 'active' AND m.role IN ('ceo', 'coo')
       AND (p_query IS NULL OR u.full_name ILIKE '%' || p_query || '%' OR o.name ILIKE '%' || p_query || '%')
     ORDER BY u.full_name LIMIT 4;
END $$;

GRANT EXECUTE ON FUNCTION file_report, report_reply_as_reporter, report_reply_as_ceo, my_reports,
    my_report_thread, report_mark_read, list_game_masters, gm_message_threads, gm_message_thread,
    gm_message_send, gm_message_start, gm_message_mark_read, gm_message_contacts,
    message_role_of, messaging_pair_allowed TO hrms_app;

COMMIT;
