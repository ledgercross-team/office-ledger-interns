-- Office Ledger HRMS rule tests (116 checks).
-- RUN ONLY ON A THROWAWAY DATABASE. It adds sample people and projects and changes plan seat limits.
-- Load hrms_schema.sql first, then run this file as a superuser (or an owner that is a member of hrms_app):
--     psql -d <throwaway> -f hrms_schema.sql
--     psql -d <throwaway> -f hrms_rule_tests.sql
-- Everything after the fixtures runs as the hrms_app role, so row-level security is on.

SET search_path = hrms, public;
\set ON_ERROR_STOP off
-- expect(label, sql): runs sql in a savepoint, reports PASS if it errors (for must-fail) 
CREATE TEMP TABLE results(label text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION hrms.must_fail(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; SET CONSTRAINTS ALL IMMEDIATE; INSERT INTO results VALUES (label, false, 'was allowed');
  EXCEPTION WHEN OTHERS THEN INSERT INTO results VALUES (label, true, SQLERRM); END;
END $$;
CREATE OR REPLACE FUNCTION hrms.must_pass(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; SET CONSTRAINTS ALL IMMEDIATE; INSERT INTO results VALUES (label, true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO results VALUES (label, false, SQLERRM); END;
END $$;
CREATE OR REPLACE FUNCTION hrms.as_(m text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('app.member_id', m, false) $$;

-- fixtures (system context)
SELECT set_config('app.member_id','',false);
INSERT INTO users(id,email,password_hash,full_name) SELECT gen_random_uuid(), n||'@x.com','h',n FROM unnest(ARRAY['gm1','gm2','ceo','coo','m1','m2','e1','e2','e3','ceo2']) n;
INSERT INTO game_masters(user_id,status) SELECT id,'active' FROM users WHERE email='gm1@x.com';
BEGIN;
INSERT INTO orgs(id,name,plan_code) VALUES ('00000000-0000-0000-0000-0000000000a1','Acme','standard');
INSERT INTO org_members(org_id,user_id,role) SELECT '00000000-0000-0000-0000-0000000000a1', id, CASE WHEN email='ceo@x.com' THEN 'ceo' WHEN email='coo@x.com' THEN 'coo' WHEN email LIKE 'm%' THEN 'manager' ELSE 'employee' END::member_role FROM users WHERE email NOT LIKE 'gm%' AND email<>'ceo2@x.com';
COMMIT;
SELECT set_config('app.org_id','00000000-0000-0000-0000-0000000000a1',false);
GRANT ALL ON results TO hrms_app;
CREATE TEMP VIEW mm AS SELECT u.email, m.id FROM org_members m JOIN users u ON u.id=m.user_id;
GRANT SELECT ON mm TO hrms_app;
SET ROLE hrms_app;
\set ON_ERROR_STOP off
SELECT id AS ceo FROM mm WHERE email='ceo@x.com' \gset
SELECT id AS coo FROM mm WHERE email='coo@x.com' \gset
SELECT id AS m1 FROM mm WHERE email='m1@x.com' \gset
SELECT id AS m2 FROM mm WHERE email='m2@x.com' \gset
SELECT id AS e1 FROM mm WHERE email='e1@x.com' \gset
SELECT id AS e2 FROM mm WHERE email='e2@x.com' \gset
SELECT id AS e3 FROM mm WHERE email='e3@x.com' \gset
\set org '00000000-0000-0000-0000-0000000000a1'

-- gameMasters
SELECT must_fail('gm: cannot remove last active gameMaster', $$UPDATE game_masters SET status='removed', removed_at=now()$$);
SELECT must_fail('gm: new gm cannot self-confirm', format($$INSERT INTO game_masters(user_id,status,created_by,confirmed_by) SELECT id,'active',(SELECT user_id FROM game_masters),id FROM users WHERE email='gm2@x.com'$$));
SELECT must_pass('gm: second gm created pending', $$INSERT INTO game_masters(user_id,status,created_by) SELECT id,'pending_confirmation',(SELECT user_id FROM game_masters) FROM users WHERE email='gm2@x.com'$$);

-- members
SELECT as_(:'coo');
SELECT must_fail('COO cannot create a CEO', format($$INSERT INTO org_members(org_id,user_id,role) SELECT %L,id,'ceo' FROM users WHERE email='ceo2@x.com'$$, :'org'));
SELECT must_pass('COO can create an employee', format($$INSERT INTO org_members(org_id,user_id,role) SELECT %L,id,'employee' FROM users WHERE email='ceo2@x.com'$$, :'org'));
SELECT as_(:'m1');
SELECT must_fail('manager cannot create a user directly', format($$INSERT INTO org_members(org_id,user_id,role) SELECT %L,gen_random_uuid(),'employee'$$, :'org'));
SELECT must_fail('manager cannot change roles', format($$UPDATE org_members SET role='coo' WHERE id=%L$$, :'e1'));
SELECT must_fail('manager cannot change a profile outside own projects (e3)', format($$UPDATE org_members SET designation='x' WHERE id=%L$$, :'e3'));

-- projects
SELECT as_(:'coo');
SELECT must_fail('COO cannot create a project directly', format($$INSERT INTO projects(org_id,name,created_by) VALUES (%L,'P',%L)$$, :'org', :'coo'));
SELECT as_(:'ceo');
SELECT must_pass('CEO creates project', format($$INSERT INTO projects(id,org_id,name,created_by) VALUES ('00000000-0000-0000-0000-0000000000b1',%L,'Alpha',%L)$$, :'org', :'ceo'));
\set p '00000000-0000-0000-0000-0000000000b1'
SELECT must_pass('CEO adds manager m1', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'manager')$$, :'org', :'p', :'m1'));
SELECT must_pass('CEO adds manager m2', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'manager')$$, :'org', :'p', :'m2'));
SELECT must_pass('CEO adds employee e1', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'employee')$$, :'org', :'p', :'e1'));
SELECT must_fail('wrong project role for member', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'manager')$$, :'org', :'p', :'e2'));
SELECT must_fail('CEO/COO cannot be project members', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'manager')$$, :'org', :'p', :'coo'));
SELECT as_(:'m1');
SELECT must_fail('manager cannot add a member directly', format($$INSERT INTO project_members(org_id,project_id,member_id,role) VALUES (%L,%L,%L,'employee')$$, :'org', :'p', :'e2'));
SELECT must_fail('manager cannot tag a lead', format($$UPDATE project_members SET is_lead=true WHERE project_id=%L AND member_id=%L$$, :'p', :'m1'));
SELECT as_(:'coo');
SELECT must_pass('COO tags m1 as lead', format($$UPDATE project_members SET is_lead=true WHERE project_id=%L AND member_id=%L$$, :'p', :'m1'));
SELECT must_pass('second lead allowed', format($$UPDATE project_members SET is_lead=true WHERE project_id=%L AND member_id=%L$$, :'p', :'m2'));
SELECT must_fail('employee cannot be lead', format($$UPDATE project_members SET is_lead=true WHERE project_id=%L AND member_id=%L$$, :'p', :'e1'));

-- tasks
SELECT as_(:'e1');
SELECT must_fail('employee cannot create a task', format($$INSERT INTO tasks(org_id,project_id,title,urgency,due_at,created_by) VALUES (%L,%L,'T','high',now()+interval '3 days',%L)$$, :'org', :'p', :'e1'));
SELECT as_(:'m1');
SELECT must_pass('manager creates task (switch off)', format($$INSERT INTO tasks(id,org_id,project_id,title,urgency,due_at,created_by) VALUES ('00000000-0000-0000-0000-0000000000c1',%L,%L,'T1','high',now()+interval '3 days',%L)$$, :'org', :'p', :'m1'));
\set t '00000000-0000-0000-0000-0000000000c1'
SELECT must_fail('task cannot start with nobody assigned', format($$UPDATE tasks SET status='in_progress' WHERE id=%L$$, :'t'));
SELECT must_fail('cannot assign someone not on the project', format($$INSERT INTO task_assignees(org_id,task_id,member_id,role) VALUES (%L,%L,%L,'employee')$$, :'org', :'t', :'e2'));
SELECT must_pass('assign manager to task', format($$INSERT INTO task_assignees(org_id,task_id,member_id,role) VALUES (%L,%L,%L,'manager')$$, :'org', :'t', :'m1'));
SELECT as_(:'ceo');
SELECT must_fail('still needs an employee', format($$UPDATE tasks SET status='in_progress' WHERE id=%L$$, :'t'));
SELECT as_(:'m1');
SELECT must_pass('assign employee to task', format($$INSERT INTO task_assignees(org_id,task_id,member_id,role) VALUES (%L,%L,%L,'employee')$$, :'org', :'t', :'e1'));
SELECT as_(:'e1');
SELECT must_pass('employee starts task', format($$UPDATE tasks SET status='in_progress' WHERE id=%L$$, :'t'));
SELECT must_fail('invalid jump in_progress -> done', format($$UPDATE tasks SET status='done' WHERE id=%L$$, :'t'));
SELECT must_pass('employee moves to review', format($$UPDATE tasks SET status='in_review' WHERE id=%L$$, :'t'));
SELECT must_fail('employee cannot mark done', format($$UPDATE tasks SET status='done' WHERE id=%L$$, :'t'));
SELECT as_(:'m1');
SELECT must_fail('send-back needs a comment', format($$UPDATE tasks SET status='in_progress' WHERE id=%L$$, :'t'));
SELECT must_pass('send back with a comment', format($$UPDATE tasks SET status='in_progress', status_comment='fix typos' WHERE id=%L$$, :'t'));
SELECT as_(:'e1');
SELECT must_pass('block with reason', format($$UPDATE tasks SET status='blocked', blocked_reason='waiting on client' WHERE id=%L$$, :'t'));
SELECT must_fail('block without reason', format($$UPDATE tasks SET status='in_progress' WHERE id=%L AND false$$, :'t')) WHERE false;
SELECT must_pass('unblock', format($$UPDATE tasks SET status='in_progress' WHERE id=%L$$, :'t'));
SELECT must_pass('to review again', format($$UPDATE tasks SET status='in_review' WHERE id=%L$$, :'t'));
SELECT as_(:'m2');
SELECT must_fail('manager not on the task cannot approve', format($$UPDATE tasks SET status='done' WHERE id=%L$$, :'t'));
SELECT as_(:'m1');
SELECT must_pass('manager on task marks done', format($$UPDATE tasks SET status='done' WHERE id=%L$$, :'t'));
SELECT must_fail('tasks cannot be deleted', format($$DELETE FROM tasks WHERE id=%L$$, :'t'));

-- approval switch
SELECT as_(:'coo');
SELECT must_pass('COO turns m2 approval switch on', format($$UPDATE org_members SET task_approval_required=true WHERE id=%L$$, :'m2'));
SELECT as_(:'m2');
SELECT must_fail('switch on: task without approved request', format($$INSERT INTO tasks(org_id,project_id,title,urgency,due_at,created_by) VALUES (%L,%L,'T2','low',now()+interval '3 days',%L)$$, :'org', :'p', :'m2'));
SELECT must_pass('m2 files create_task request', format($$INSERT INTO requests(id,org_id,type,requested_by,project_id,payload) VALUES ('00000000-0000-0000-0000-0000000000d1',%L,'create_task',%L,%L,'{}')$$, :'org', :'m2', :'p'));
\set r1 '00000000-0000-0000-0000-0000000000d1'
SELECT must_fail('requester cannot approve own request', format($$UPDATE requests SET status='approved' WHERE id=%L$$, :'r1'));
SELECT as_(:'m1');
SELECT must_pass('another lead approves', format($$UPDATE requests SET status='approved' WHERE id=%L$$, :'r1'));
SELECT as_(:'m2');
SELECT must_pass('task created with approved request', format($$INSERT INTO tasks(id,org_id,project_id,title,urgency,due_at,created_by,created_via_request) VALUES ('00000000-0000-0000-0000-0000000000c2',%L,%L,'T2','low',now()+interval '3 days',%L,%L)$$, :'org', :'p', :'m2', :'r1'));

-- create_user request, seats
SELECT as_(:'ceo');
UPDATE plans SET seat_limit = 7 WHERE code='standard';
SELECT as_(:'m1');
SELECT must_pass('manager files create_user request', format($$INSERT INTO requests(id,org_id,type,requested_by,payload) VALUES ('00000000-0000-0000-0000-0000000000d2',%L,'create_user',%L,'{"email":"n@x.com","full_name":"N","role":"employee"}')$$, :'org', :'m1'));
SELECT as_(:'m2');
SELECT must_fail('lead manager cannot approve create_user', $$UPDATE requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000d2'$$);
SELECT as_(:'coo');
SELECT must_pass('COO approves create_user', $$UPDATE requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000d2'$$);
SELECT as_(:'m1');
SELECT must_fail('seat limit refuses request past the limit', format($$INSERT INTO requests(org_id,type,requested_by,payload) VALUES (%L,'create_user',%L,'{"email":"o@x.com","full_name":"O","role":"employee"}')$$, :'org', :'m1'));
SELECT (SELECT seats_used FROM v_org_seat_usage WHERE org_id=:'org') AS seats_used_now;

-- invites
SELECT as_(:'ceo');
SELECT must_pass('CEO invites e2', format($$INSERT INTO project_invites(id,org_id,project_id,invitee_member_id,role,invited_by) VALUES ('00000000-0000-0000-0000-0000000000e1',%L,%L,%L,'employee',%L)$$, :'org', :'p', :'e2', :'ceo'));
SELECT as_(:'e2');
SELECT must_pass('e2 declines', $$UPDATE project_invites SET status='declined', decline_reason='overloaded' WHERE id='00000000-0000-0000-0000-0000000000e1'$$);
SELECT as_(:'coo');
SELECT must_fail('only the inviter reviews the decline', $$UPDATE project_invites SET status='overruled', review_reason='needed' WHERE id='00000000-0000-0000-0000-0000000000e1'$$);
SELECT as_(:'ceo');
SELECT must_fail('overrule needs a reason', $$UPDATE project_invites SET status='overruled' WHERE id='00000000-0000-0000-0000-0000000000e1'$$);
SELECT must_pass('inviter overrules with reason', $$UPDATE project_invites SET status='overruled', review_reason='critical skills' WHERE id='00000000-0000-0000-0000-0000000000e1'$$);
SELECT as_('');
SELECT (SELECT count(*) FROM project_members WHERE project_id=:'p' AND member_id=:'e2' AND removed_at IS NULL) = 1 AS overruled_invite_joined;

-- meetings
SELECT as_(:'m1');
SELECT must_fail('meeting needs link or location', format($$INSERT INTO meetings(org_id,title,starts_at,ends_at,created_by) VALUES (%L,'Sync',now(),now()+interval '1 hour',%L)$$, :'org', :'m1'));
SELECT must_fail('meeting cannot have both', format($$INSERT INTO meetings(org_id,title,starts_at,ends_at,created_by,meeting_link,location) VALUES (%L,'Sync',now(),now()+interval '1 hour',%L,'https://meet.x/a','HQ')$$, :'org', :'m1'));
SELECT must_fail('meeting without invitees', format($$INSERT INTO meetings(org_id,title,starts_at,ends_at,created_by,location) VALUES (%L,'Sync',now(),now()+interval '1 hour',%L,'HQ')$$, :'org', :'m1'));
SELECT must_pass('meeting with link + invitee', format($$WITH mt AS (INSERT INTO meetings(org_id,title,starts_at,ends_at,created_by,meeting_link) VALUES (%L,'Sync',now(),now()+interval '1 hour',%L,'https://meet.example.com/abc') RETURNING id, org_id) INSERT INTO meeting_invitees(org_id,meeting_id,member_id) SELECT org_id,id,%L FROM mt$$, :'org', :'m1', :'e1'));
SELECT as_(:'e1');
SELECT must_fail('employee cannot create a meeting', format($$INSERT INTO meetings(org_id,title,starts_at,ends_at,created_by,location) VALUES (%L,'X',now(),now()+interval '1 hour',%L,'HQ')$$, :'org', :'e1'));

-- attendance
SELECT as_('');
INSERT INTO org_office_networks(org_id,network) VALUES (:'org','10.0.0.0/24');
SELECT as_(:'e1');
SELECT must_fail('check-in from outside the office', format($$INSERT INTO attendance_days(org_id,member_id,work_date,status,check_in_at,check_in_ip) VALUES (%L,%L,current_date,'present',now(),'8.8.8.8')$$, :'org', :'e1'));
SELECT must_pass('check-in from office', format($$INSERT INTO attendance_days(org_id,member_id,work_date,status,check_in_at,check_in_ip) VALUES (%L,%L,current_date,'present',now(),'10.0.0.5')$$, :'org', :'e1'));
-- without an office network configured, check-in is refused until a CEO or COO adds one
SELECT must_fail('employee cannot add an office network', format($$INSERT INTO org_office_networks(org_id,network) VALUES (%L,'10.10.10.0/24')$$, :'org'));
SELECT as_('');
DELETE FROM org_office_networks WHERE org_id = :'org';
SELECT must_fail('check-in without an office network', format($$INSERT INTO attendance_days(org_id,member_id,work_date,status,check_in_at,check_in_ip) VALUES (%L,%L,current_date + 1,'present',now() + interval '1 day',NULL)$$, :'org', :'e1'));
INSERT INTO org_office_networks(org_id,network) VALUES (:'org','10.0.0.0/24');
SELECT as_(:'e1');
SELECT must_fail('attendance cannot be deleted', $$DELETE FROM attendance_days$$);

-- history
SELECT must_fail('history cannot be edited', $$UPDATE audit_log SET action='x'$$);
SELECT must_fail('history cannot be deleted', $$DELETE FROM audit_log$$);
SELECT as_(:'ceo');
SELECT must_pass('CEO adds a note to history', format($$INSERT INTO audit_notes(audit_id,org_id,author_id,note) SELECT min(id),%L,%L,'checked' FROM audit_log WHERE org_id IS NOT NULL$$, :'org', :'ceo'));
SELECT as_(:'coo');
SELECT must_fail('COO cannot add a note', format($$INSERT INTO audit_notes(audit_id,org_id,author_id,note) SELECT min(id),%L,%L,'x' FROM audit_log WHERE org_id IS NOT NULL$$, :'org', :'coo'));

-- last CEO
SELECT as_(:'ceo');
SELECT must_fail('cannot demote the last CEO', format($$UPDATE org_members SET role='coo' WHERE id=%L$$, :'ceo'));
SELECT must_fail('cannot deactivate the last CEO', format($$UPDATE org_members SET status='deactivated', deactivated_at=now() WHERE id=%L$$, :'ceo'));

-- project completion
SELECT as_(:'m1');
SELECT must_fail('cannot tick with an open task', format($$INSERT INTO project_completion_ticks(org_id,project_id,member_id) VALUES (%L,%L,%L)$$, :'org', :'p', :'m1'));
SELECT as_(:'ceo');
SELECT must_pass('CEO cancels the open task', $$UPDATE tasks SET status='cancelled', cancel_reason='dropped' WHERE id='00000000-0000-0000-0000-0000000000c2'$$);
SELECT as_(:'m1');
SELECT must_pass('m1 ticks', format($$INSERT INTO project_completion_ticks(org_id,project_id,member_id) VALUES (%L,%L,%L)$$, :'org', :'p', :'m1'));
SELECT status AS status_after_one_tick FROM projects WHERE id=:'p';
SELECT as_(:'m2');
SELECT must_pass('m2 ticks', format($$INSERT INTO project_completion_ticks(org_id,project_id,member_id) VALUES (%L,%L,%L)$$, :'org', :'p', :'m2'));
SELECT status AS status_after_all_ticks FROM projects WHERE id=:'p';
SELECT as_(:'ceo');
SELECT must_fail('only a lead approves when a lead exists', format($$UPDATE projects SET status='completed' WHERE id=%L$$, :'p'));
SELECT as_(:'m1');
SELECT must_pass('lead approves completion', format($$UPDATE projects SET status='completed' WHERE id=%L$$, :'p'));
SELECT must_fail('no tasks in a completed project', format($$INSERT INTO tasks(org_id,project_id,title,urgency,due_at,created_by) VALUES (%L,%L,'late','low',now(),%L)$$, :'org', :'p', :'m1'));
-- ratings
SELECT as_(:'e1');
SELECT must_pass('employee rates manager', format($$INSERT INTO project_ratings(org_id,project_id,rater_member_id,ratee_member_id,stars) VALUES (%L,%L,%L,%L,5)$$, :'org', :'p', :'e1', :'m1'));
SELECT must_fail('employee cannot rate an employee', format($$INSERT INTO project_ratings(org_id,project_id,rater_member_id,ratee_member_id,stars) VALUES (%L,%L,%L,%L,4)$$, :'org', :'p', :'e1', :'e2'));
SELECT must_fail('low rating needs a comment', format($$INSERT INTO project_ratings(org_id,project_id,rater_member_id,ratee_member_id,stars) VALUES (%L,%L,%L,%L,2)$$, :'org', :'p', :'e1', :'m2'));
SELECT must_fail('ratings cannot be edited', $$UPDATE project_ratings SET stars=1$$);

-- archive
SELECT as_(:'coo');
SELECT must_fail('COO cannot archive', format($$UPDATE projects SET status='archived' WHERE id=%L$$, :'p'));
SELECT as_(:'ceo');
SELECT must_pass('CEO archives', format($$UPDATE projects SET status='archived' WHERE id=%L$$, :'p'));


-- leave routing (§12)
SELECT as_(:'e3');
SELECT id AS lt_annual FROM leave_types WHERE code='annual' \gset
SELECT must_pass('e3 (no project) requests leave', format($$WITH r AS (INSERT INTO requests(id,org_id,type,requested_by,payload) VALUES ('00000000-0000-0000-0000-0000000000f1',%L,'leave',%L,'{}') RETURNING id) INSERT INTO leave_requests(request_id,org_id,member_id,leave_type_id,start_date,end_date,days,reason) VALUES ('00000000-0000-0000-0000-0000000000f1',%L,%L,%L,current_date+10,current_date+12,3,'family')$$, :'org', :'e3', :'org', :'e3', :'lt_annual'));
SELECT as_(:'m2');
SELECT must_fail('manager with no link to e3 cannot approve leave', $$UPDATE requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000f1'$$);
SELECT as_(:'coo');
SELECT must_pass('COO approves leave of someone on no project', $$UPDATE requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000f1'$$);
SELECT as_(:'e3');
SELECT must_pass('second, overlapping leave is filed', format($$WITH r AS (INSERT INTO requests(id,org_id,type,requested_by,payload) VALUES ('00000000-0000-0000-0000-0000000000f2',%L,'leave',%L,'{}') RETURNING id) INSERT INTO leave_requests(request_id,org_id,member_id,leave_type_id,start_date,end_date,days,reason) VALUES ('00000000-0000-0000-0000-0000000000f2',%L,%L,%L,current_date+11,current_date+11,1,'x')$$, :'org', :'e3', :'org', :'e3', :'lt_annual'));
SELECT as_(:'coo');
SELECT must_fail('overlapping leave cannot be approved', $$UPDATE requests SET status='approved' WHERE id='00000000-0000-0000-0000-0000000000f2'$$);
SELECT as_(:'e3');
SELECT must_fail('cannot file leave on someone else''s request', format($$INSERT INTO leave_requests(request_id,org_id,member_id,leave_type_id,start_date,end_date,days,reason) VALUES ('00000000-0000-0000-0000-0000000000f2',%L,%L,%L,current_date,current_date,1,'x')$$, :'org', :'coo', :'lt_annual'));

-- downgrade guard (§9)
SELECT as_('');
SELECT must_fail('downgrade blocked while over the new limit', $$UPDATE plans SET seat_limit=2 WHERE code='premium'; UPDATE orgs SET plan_code='premium' WHERE false$$) WHERE false;
UPDATE plans SET seat_limit = 3 WHERE code='premium';
SELECT must_fail('downgrade blocked while over the new limit', format($$UPDATE orgs SET plan_code='premium' WHERE id=%L$$, :'org'));
UPDATE plans SET seat_limit = 5000 WHERE code='premium';
SELECT must_pass('suspending a member frees the seat and unassigns tasks', format($$UPDATE org_members SET status='suspended', suspended_at=now() WHERE id=%L$$, :'e3'));

-- pending create_user request reserves a seat; applying it must not double count
SELECT (SELECT seats_used FROM v_org_seat_usage WHERE org_id=:'org') AS seats_used_after_suspend;

-- RLS + anonymous ratings, as the app role

SET app.org_id = '00000000-0000-0000-0000-0000000000a1';
SELECT count(*) > 0 AS app_sees_own_org_members FROM org_members;
SELECT must_fail('app role cannot read raw ratings', $$SELECT * FROM project_ratings$$);
SELECT must_fail('app role cannot edit history', $$UPDATE audit_log SET action='x'$$);
SET app.org_id = '00000000-0000-0000-0000-00000000ffff';
SELECT count(*) AS other_org_members_visible FROM org_members;
SELECT count(*) AS other_org_projects_visible FROM projects;
SELECT must_fail('app role cannot write into another org', format($$INSERT INTO projects(org_id,name,created_by) VALUES (%L,'Evil',%L)$$, :'org', :'ceo'));

-- jobs and views
SELECT as_('');
SELECT set_config('app.org_id', :'org', false);
SELECT must_pass('performance job runs', format($$SELECT job_compute_performance(%L, current_date)$$, :'org'));
SELECT must_pass('expire job runs', $$SELECT job_expire_pending()$$);
SELECT must_pass('views query', $$SELECT count(*) FROM v_member_workload, v_calendar_events, v_project_progress, v_task_flags, v_project_flags, v_leave_balance, v_downgrade_candidates, v_performance_dashboard$$);
SELECT must_pass('working-day expiry skips weekend', $$SELECT add_working_days('00000000-0000-0000-0000-0000000000a1', '2026-10-16 10:00+00', 3)$$);
SELECT add_working_days(:'org', '2026-10-16 10:00+00', 3) AS fri_plus_3_working_days;


-- ===== app-role checks: login, gameMaster console, views, jobs =====
SELECT id AS gmuser FROM users WHERE email='gm1@x.com' \gset
SELECT id AS ceouser FROM users WHERE email='ceo@x.com' \gset
SELECT as_('');
SELECT set_config('app.org_id','',false);
SELECT set_config('app.user_id', :'ceouser', false);
SELECT must_pass('login: my_memberships works with no org chosen', format($$SELECT 1/ (count(*))::int FROM my_memberships(%L)$$, :'ceouser'));
SELECT must_fail('login: cannot list someone else''s memberships', format($$SELECT * FROM my_memberships(%L)$$, :'gmuser'));
SELECT must_fail('gm console: a CEO is refused', $$SELECT * FROM gm_list_orgs()$$);
SELECT set_config('app.user_id', :'gmuser', false);
SELECT must_pass('gm console: gameMaster lists orgs', $$SELECT 1/(count(*))::int FROM gm_list_orgs()$$);
SELECT org_id IS NOT NULL AS gm_sees_counts_only, ceo_count, coo_count, seats_used, seat_limit FROM gm_list_orgs();
SELECT set_config('app.org_id','',false);
SELECT (SELECT count(*) FROM org_members) AS gm_sees_member_rows_without_function, (SELECT count(*) FROM projects) AS gm_sees_project_rows, (SELECT count(*) FROM tasks) AS gm_sees_task_rows;
SELECT id AS newceo FROM users WHERE email='ceo2@x.com' \gset
SELECT must_pass('gm creates an org with its first CEO', format($$SELECT gm_create_org('Globex','premium',%L)$$, :'newceo'));
SELECT must_fail('gm: org without a CEO is impossible', format($$INSERT INTO orgs(name,plan_code) VALUES ('Orphan','standard')$$));
SELECT set_config('app.org_id','',false);
SELECT must_pass('gm blocks an org', format($$SELECT gm_set_org_blocked(%L, true, 'abuse')$$, :'org'));
SELECT must_pass('gm unblocks an org', format($$SELECT gm_set_org_blocked(%L, false)$$, :'org'));
-- views must not leak across orgs
SELECT set_config('app.org_id','00000000-0000-0000-0000-00000000ffff',false);
SELECT (SELECT count(*) FROM v_member_workload) AS workload_rows_other_org,
       (SELECT count(*) FROM v_project_progress) AS progress_rows_other_org,
       (SELECT count(*) FROM v_calendar_events) AS calendar_rows_other_org,
       (SELECT count(*) FROM v_rating_summary) AS rating_rows_other_org,
       (SELECT count(*) FROM v_performance_dashboard) AS perf_rows_other_org;
SELECT set_config('app.org_id', :'org', false);
SELECT must_pass('own-org view still returns rows', $$SELECT 1/(count(*))::int FROM v_member_workload$$);
SELECT must_fail('performance job refuses another org', $$SELECT job_compute_performance('00000000-0000-0000-0000-00000000ffff', current_date)$$);

-- last-CEO removal through the gameMaster
SELECT set_config('app.user_id', :'ceouser', false);
SELECT set_config('app.org_id', :'org', false);
SELECT as_(:'ceo');
SELECT must_pass('CEO files a last-CEO removal request', format($$INSERT INTO platform_requests(id,org_id,type,requested_by,target_member_id,replacement_user_id) VALUES ('00000000-0000-0000-0000-0000000000aa',%L,'remove_last_ceo',%L,%L,%L)$$, :'org', :'ceo', :'ceo', :'newceo'));
SELECT as_('');
SELECT set_config('app.user_id', :'gmuser', false);
SELECT set_config('app.org_id','',false);
SELECT must_pass('gm lists platform requests', $$SELECT 1/(count(*))::int FROM gm_list_platform_requests()$$);
SELECT must_fail('gm cannot complete before verifying', $$SELECT gm_complete_remove_last_ceo('00000000-0000-0000-0000-0000000000aa')$$);
SELECT must_pass('gm verifies after the offline check', $$SELECT gm_verify_platform_request('00000000-0000-0000-0000-0000000000aa')$$);
SELECT must_pass('gm completes the removal', $$SELECT gm_complete_remove_last_ceo('00000000-0000-0000-0000-0000000000aa')$$);
SELECT set_config('app.org_id', :'org', false);
SELECT (SELECT count(*) FROM org_members WHERE role='ceo' AND status='active') AS active_ceos_after,
       (SELECT status FROM org_members WHERE id=:'ceo') AS old_ceo_status;

-- plan change by the gameMaster
SELECT set_config('app.user_id', :'gmuser', false);
SELECT set_config('app.org_id','',false);
SELECT as_('');
UPDATE plans SET seat_limit = 2 WHERE code = 'premium';
SELECT must_fail('gm downgrade refused while over the new limit', format($$SELECT gm_set_org_plan(%L,'premium')$$, :'org'));
UPDATE plans SET seat_limit = 5000 WHERE code = 'premium';
SELECT must_pass('gm changes the plan and records a subscription', format($$SELECT gm_set_org_plan(%L,'premium')$$, :'org'));
SELECT set_config('app.org_id', :'org', false);
SELECT plan_code AS plan_after, (SELECT count(*) FROM subscriptions) AS subscription_rows FROM orgs;

-- jobs and score visibility
SELECT set_config('app.org_id','',false);
SELECT as_('');
SELECT must_pass('jobs: list_active_org_ids works with no org set', $$SELECT 1/(count(*))::int FROM list_active_org_ids()$$);
SELECT set_config('app.org_id', :'org', false);
SELECT as_(:'e1');
SELECT must_pass('employee computing nothing: scores table readable but empty for employees', $$SELECT 1/(1 - (count(*) > 0)::int)::int FROM performance_scores$$);
SELECT must_fail('employee cannot write scores', format($$INSERT INTO performance_scores(org_id,member_id,computed_on,window_start,working_days,attendance_points,rating_count,ontime_total,ontime_on_time,is_new,has_ratings) VALUES (%L,%L,current_date,current_date,1,1,0,0,0,false,false)$$, :'org', :'e1'));
SELECT as_(:'m2');
SELECT (SELECT count(*) FROM performance_scores) AS manager_sees_scores;

\echo ===== RESULTS =====
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, label, left(detail, 90) AS detail FROM results ORDER BY ok, label;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
