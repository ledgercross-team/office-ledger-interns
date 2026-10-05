-- Everything on the Daily Report page for one date, as a single JSON document.
create or replace function fn_daily_report(p_ws uuid, p_date date) returns jsonb
language sql stable as $$
  with s as (select * from workspace_settings where workspace_id = p_ws),
  is_workday as (select exists (select 1 from fn_workdays(p_ws, p_date, p_date)) as v),
  m as (
    select id from memberships
    where workspace_id = p_ws and status = 'active' and role <> 'owner'
      and coalesce(joined_at, p_date) <= p_date
  ),
  a as (
    select a.* from attendance a join m on m.id = a.membership_id
    where a.workspace_id = p_ws and a.date = p_date
  ),
  att as (
    select
      (select count(*) from m)::int as members,
      count(*) filter (where check_in_at is not null and approval <> 'rejected')::int as present,
      count(*) filter (where status = 'late' and approval <> 'rejected')::int as late,
      count(*) filter (where mode = 'remote' and check_in_at is not null and approval <> 'rejected')::int as remote,
      count(*) filter (where status = 'on_leave')::int as on_leave,
      count(*) filter (where status = 'half_day')::int as half_days,
      count(*) filter (where check_in_at is not null and (auto_checked_out or (check_out_at is null and p_date < fn_local_today(p_ws))))::int as missing_checkout,
      count(*) filter (where check_out_at is not null)::int as checked_out
    from a
  ),
  summ as (
    select coalesce(sum(tracked_minutes), 0)::bigint as worked_minutes
    from fn_attendance_summary(p_ws, p_date, p_date)
  ),
  lock_at as (
    select ((p_date + s.office_end) at time zone w.timezone) as t
    from s join workspaces w on w.id = s.workspace_id
  )
  select jsonb_build_object(
    'date', p_date,
    'isWorkday', (select v from is_workday),
    'lockAt', (select t from lock_at),
    'officeEnd', (select office_end from s),
    'attendance', jsonb_build_object(
      'expected', case when (select v from is_workday) then att.members else 0 end,
      'present', att.present,
      'late', att.late,
      'remote', att.remote,
      'onLeave', att.on_leave,
      'absent', case when (select v from is_workday)
                     then greatest(0, att.members - att.present - att.on_leave
                                       - (select count(*) from a where status = 'half_day' and check_in_at is null))
                     else 0 end,
      'checkedOut', att.checked_out
    ),
    'pendingReviews', (select count(*) from v_inbox_items i where i.workspace_id = p_ws)::int,
    'openTasks', (select count(*) from tasks t where t.workspace_id = p_ws and t.archived_at is null and t.status <> 'done')::int,
    'urgentTasks', (select count(*) from tasks t where t.workspace_id = p_ws and t.archived_at is null and t.status <> 'done' and t.priority = 'urgent')::int,
    'blockedTasks', (select count(*) from tasks t where t.workspace_id = p_ws and t.archived_at is null and t.status = 'blocked')::int,
    'openComplaints', (select count(*) from complaints c where c.workspace_id = p_ws and c.status <> 'resolved')::int,
    'corrections', (select count(*) from daily_report_corrections c where c.workspace_id = p_ws and c.date = p_date)::int,
    'operational', jsonb_build_object(
      'workedMinutes', (select worked_minutes from summ),
      'halfDays', att.half_days,
      'missingCheckout', att.missing_checkout,
      'meetings', (select count(*) from meetings mt join workspaces w on w.id = mt.workspace_id
                   where mt.workspace_id = p_ws
                     and fn_meeting_occurs((mt.starts_at at time zone w.timezone)::date, mt.recurrence, mt.recurrence_until, p_date, (select weekend_days from s)))::int,
      'holidays', (select count(*) from holidays h where h.workspace_id = p_ws and h.status = 'active'
                   and date_trunc('month', h.date) = date_trunc('month', p_date::timestamp))::int,
      'isHoliday', exists (select 1 from holidays h where h.workspace_id = p_ws and h.status = 'active' and h.date = p_date)
    )
  )
  from att
$$;

-- Dashboard for "today" plus an N-day attendance series. Exposed as v_dashboard_today (7 days).
create or replace function fn_dashboard_today(p_ws uuid, p_days int default 7) returns jsonb
language sql stable as $$
  with t as (select fn_local_today(p_ws) as today, fn_now() as now_ts),
  r as (select fn_daily_report(p_ws, (select today from t)) as d),
  s as (select * from workspace_settings where workspace_id = p_ws),
  w as (select timezone from workspaces where id = p_ws),
  today_att as (
    select a.* from attendance a
    join memberships mb on mb.id = a.membership_id and mb.status = 'active' and mb.role <> 'owner'
    where a.workspace_id = p_ws and a.date = (select today from t) and a.check_in_at is not null and a.approval <> 'rejected'
  ),
  worked as (
    select coalesce(sum(coalesce(tracked_minutes,
      greatest(0, extract(epoch from ((select now_ts from t) - check_in_at)) / 60 - break_minutes))), 0) as minutes,
      count(*) as present
    from today_att
  ),
  elapsed as (
    select greatest(0, least(
      extract(epoch from (s.office_end - s.office_start)) / 60,
      extract(epoch from (fn_local_now(p_ws)::time - s.office_start)) / 60
    )) as minutes
    from s
  ),
  series as (
    select jsonb_agg(jsonb_build_object(
      'date', d.day,
      'isWorkday', exists (select 1 from fn_workdays(p_ws, d.day, d.day)),
      'present', (select count(*) from attendance a where a.workspace_id = p_ws and a.date = d.day and a.check_in_at is not null and a.approval <> 'rejected'),
      'late', (select count(*) from attendance a where a.workspace_id = p_ws and a.date = d.day and a.status = 'late' and a.approval <> 'rejected'),
      'remote', (select count(*) from attendance a where a.workspace_id = p_ws and a.date = d.day and a.mode = 'remote' and a.check_in_at is not null and a.approval <> 'rejected')
    ) order by d.day) as data
    from (select gs::date as day from t, generate_series((t.today - (p_days - 1))::timestamp, t.today::timestamp, interval '1 day') gs) d
  )
  select jsonb_build_object(
    'today', (select today from t),
    'report', (select d from r),
    'coverage', case when ((r.d->'attendance'->>'expected')::int - (r.d->'attendance'->>'onLeave')::int) > 0
      then round(100.0 * (r.d->'attendance'->>'present')::int
                 / ((r.d->'attendance'->>'expected')::int - (r.d->'attendance'->>'onLeave')::int), 1)
      else 0 end,
    'workedRate', case when (select present from worked) > 0 and (select minutes from elapsed) > 0
      then least(100, round(100.0 * (select minutes from worked) / ((select present from worked) * (select minutes from elapsed)), 1))
      else 0 end,
    'series', (select data from series)
  )
  from r
$$;

create view v_dashboard_today with (security_invoker = true) as
  select w.id as workspace_id, fn_dashboard_today(w.id, 7) as data from workspaces w;
