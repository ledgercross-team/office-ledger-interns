-- Inbox: one row per item needing an Owner/Manager decision. security_invoker keeps RLS in force.
drop view if exists v_dashboard_today;
drop view if exists v_inbox_items cascade;

create view v_inbox_items with (security_invoker = true) as
with ws as (
  select w.id, w.timezone, fn_local_today(w.id) as today, fn_window_minutes(w.id) as window_min from workspaces w
),
person as (
  select mb.id, mb.workspace_id, mb.role, mb.employee_code, u.name, d.name as department, mb.department_id
  from memberships mb
  join users u on u.id = mb.user_id
  left join departments d on d.id = mb.department_id
)
-- Decisions -------------------------------------------------------------------------------------
select mb.workspace_id, 'join:' || mb.id as item_id, 'join'::text as kind, 'decisions'::text as tab,
  'medium'::text as priority, 'memberships'::text as source_table, mb.id as source_id, mb.created_at,
  p.id as requester_id, p.role::text as requester_role, p.name as requester_name, p.employee_code,
  p.department, p.department_id, 'Join request'::text as title,
  'Wants to join the workspace'::text as reason, jsonb_build_object('email', u.email) as meta
from memberships mb join person p on p.id = mb.id join users u on u.id = mb.user_id
where mb.status = 'pending'
union all
select lr.workspace_id, 'leave:' || lr.id,
  case when lr.kind = 'half_day' then 'half_day' else 'leave' end,
  'decisions',
  case when lr.start_date <= ws.today + 2 then 'high' else 'medium' end,
  'leave_requests', lr.id, lr.created_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  case when lr.kind = 'half_day' then 'Half-day request' else coalesce(lt.name, 'Leave') || ' leave request' end,
  lr.reason,
  jsonb_build_object('startDate', lr.start_date, 'endDate', lr.end_date, 'days', lr.days, 'half', lr.half, 'type', lt.name)
from leave_requests lr join ws on ws.id = lr.workspace_id join person p on p.id = lr.membership_id
left join leave_types lt on lt.id = lr.leave_type_id
where lr.status = 'pending'
union all
select h.workspace_id, 'holiday:' || h.id,
  case when h.status = 'proposed' then 'holiday_add' else 'holiday_remove' end,
  'decisions', 'medium', 'holidays', h.id, h.updated_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  case when h.status = 'proposed' then 'Holiday proposal' else 'Holiday removal' end,
  h.name || ' on ' || to_char(h.date, 'Dy, Mon DD YYYY'),
  jsonb_build_object('date', h.date, 'name', h.name)
from holidays h left join person p on p.id = coalesce(h.removal_requested_by, h.proposed_by)
where h.status = 'proposed' or (h.status = 'active' and h.removal_requested_by is not null)
-- Reviews ---------------------------------------------------------------------------------------
union all
select a.workspace_id, 'attendance:' || a.id, 'attendance', 'reviews', 'low', 'attendance', a.id, a.created_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  case when a.status = 'late' and a.mode = 'remote' then 'Late remote check-in'
       when a.status = 'late' then 'Late check-in' else 'Remote check-in' end,
  coalesce(a.note, case when a.late_minutes > 0 then a.late_minutes || ' min late' else 'Working remotely' end),
  jsonb_build_object('date', a.date, 'checkInAt', a.check_in_at, 'mode', a.mode, 'lateMinutes', a.late_minutes)
from attendance a join person p on p.id = a.membership_id
where a.approval = 'pending'
union all
select c.workspace_id, 'correction:' || c.id, 'correction', 'reviews', 'medium', 'attendance_corrections', c.id, c.created_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  'Attendance correction', c.reason,
  jsonb_build_object('date', c.date, 'checkIn', c.requested_check_in, 'checkOut', c.requested_check_out)
from attendance_corrections c join person p on p.id = c.membership_id
where c.status = 'pending'
union all
select c.workspace_id, 'complaint:' || c.id, 'complaint', 'reviews',
  case c.severity when 'critical' then 'high' when 'high' then 'high' when 'low' then 'low' else 'medium' end,
  'complaints', c.id, c.created_at,
  case when c.anonymous then null else p.id end,
  case when c.anonymous then null else p.role::text end,
  case when c.anonymous then 'Anonymous' else p.name end,
  case when c.anonymous then null else p.employee_code end,
  case when c.anonymous then null else p.department end,
  case when c.anonymous then null else p.department_id end,
  'Issue: ' || c.subject, left(c.description, 280),
  jsonb_build_object('category', c.category, 'severity', c.severity)
from complaints c left join person p on p.id = c.submitter_id
where c.status = 'new'
-- Exceptions ------------------------------------------------------------------------------------
union all
select a.workspace_id, 'missing_checkout:' || a.membership_id || ':' || a.date, 'missing_checkout', 'exceptions', 'medium',
  'attendance', a.id, a.updated_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  'Missing checkout',
  'Checked in at ' || to_char(a.check_in_at at time zone ws.timezone, 'HH24:MI') || ' on ' || to_char(a.date, 'Mon DD') ||
    case when a.auto_checked_out then ' · auto checked out' else ' · no checkout' end,
  jsonb_build_object('date', a.date, 'membershipId', a.membership_id)
from attendance a join ws on ws.id = a.workspace_id join person p on p.id = a.membership_id
where a.check_in_at is not null and a.date >= ws.today - 14
  and (a.auto_checked_out or (a.check_out_at is null and a.date < ws.today))
  and not exists (select 1 from exception_acks e where e.workspace_id = a.workspace_id and e.kind = 'missing_checkout'
                  and e.membership_id = a.membership_id and e.date = a.date)
union all
select a.workspace_id, 'overtime:' || a.membership_id || ':' || a.date, 'overtime', 'exceptions', 'low',
  'attendance', a.id, a.updated_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  'Overtime', round(a.tracked_minutes / 60.0, 1) || ' h tracked on ' || to_char(a.date, 'Mon DD'),
  jsonb_build_object('date', a.date, 'membershipId', a.membership_id, 'trackedMinutes', a.tracked_minutes)
from attendance a join ws on ws.id = a.workspace_id join person p on p.id = a.membership_id
where a.date >= ws.today - 14 and a.tracked_minutes > ws.window_min + 120 and not a.auto_checked_out
  and not exists (select 1 from exception_acks e where e.workspace_id = a.workspace_id and e.kind = 'overtime'
                  and e.membership_id = a.membership_id and e.date = a.date)
union all
select a.workspace_id, 'anomaly:' || a.membership_id || ':' || a.date, 'anomaly', 'exceptions', 'low',
  'attendance', a.id, a.updated_at,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  'Short day', coalesce(a.tracked_minutes, 0) || ' min tracked on ' || to_char(a.date, 'Mon DD'),
  jsonb_build_object('date', a.date, 'membershipId', a.membership_id, 'trackedMinutes', a.tracked_minutes)
from attendance a join ws on ws.id = a.workspace_id join person p on p.id = a.membership_id
where a.date >= ws.today - 14 and a.tracked_minutes < 60 and a.status <> 'half_day' and not a.auto_checked_out
  and not exists (select 1 from exception_acks e where e.workspace_id = a.workspace_id and e.kind = 'anomaly'
                  and e.membership_id = a.membership_id and e.date = a.date)
union all
select mb.workspace_id, 'absent:' || mb.id || ':' || wd.day, 'absent', 'exceptions', 'high',
  'memberships', mb.id, (wd.day + interval '1 day')::timestamptz,
  p.id, p.role::text, p.name, p.employee_code, p.department, p.department_id,
  'Absent without leave', 'No check-in or approved leave on ' || to_char(wd.day, 'Dy, Mon DD'),
  jsonb_build_object('date', wd.day, 'membershipId', mb.id)
from ws
cross join lateral fn_workdays(ws.id, ws.today - 7, ws.today - 1) wd
join memberships mb on mb.workspace_id = ws.id and mb.status = 'active' and mb.role <> 'owner'
  and coalesce(mb.joined_at, wd.day) <= wd.day
join person p on p.id = mb.id
where not exists (select 1 from attendance a where a.membership_id = mb.id and a.date = wd.day
                  and a.status <> 'absent' and a.approval <> 'rejected')
  and not exists (select 1 from exception_acks e where e.workspace_id = ws.id and e.kind = 'absent'
                  and e.membership_id = mb.id and e.date = wd.day);
