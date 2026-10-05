-- SQL resolvers: the single source of truth for attendance, performance and report metrics.
-- Idempotent: re-applied on every `pnpm db:migrate`.
--
-- Conventions
--   * attendance.date is the local calendar date in the workspace timezone.
--   * fn_now() honours `set app.now = '...'` so tests (and back-fills) can pin "now".
--   * Owners are not tracked: attendance metrics cover active managers and employees only.
--   * An attendance row whose approval was rejected counts as absent.

create or replace function fn_now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now())
$$;

create or replace function fn_local_now(p_ws uuid) returns timestamp
language sql stable as $$
  select fn_now() at time zone w.timezone from workspaces w where w.id = p_ws
$$;

create or replace function fn_local_today(p_ws uuid) returns date
language sql stable as $$
  select fn_local_now(p_ws)::date
$$;

-- Last date that counts as "finished" for expectations: today once office end has passed, else yesterday.
create or replace function fn_effective_end(p_ws uuid, p_end date) returns date
language sql stable as $$
  select least(
    p_end,
    case when fn_local_now(p_ws)::time >= s.office_end then fn_local_today(p_ws) else fn_local_today(p_ws) - 1 end
  )
  from workspace_settings s where s.workspace_id = p_ws
$$;

-- Working days in [p_start, p_end]: not a configured weekend day and not an active holiday.
create or replace function fn_workdays(p_ws uuid, p_start date, p_end date)
returns table(day date)
language sql stable as $$
  select d::date
  from workspace_settings s,
       generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  where s.workspace_id = p_ws
    and p_start <= p_end
    and not (extract(dow from d)::int = any (s.weekend_days))
    and not exists (
      select 1 from holidays h
      where h.workspace_id = p_ws and h.date = d::date and h.status = 'active'
    )
$$;

create or replace function fn_expected_workdays(p_ws uuid, p_start date, p_end date) returns int
language sql stable as $$
  select count(*)::int from fn_workdays(p_ws, p_start, p_end)
$$;

-- Office window minutes minus unpaid break windows (clipped to the office window).
create or replace function fn_window_minutes(p_ws uuid) returns int
language sql stable as $$
  select (
    extract(epoch from (s.office_end - s.office_start)) / 60
    - coalesce((
        select sum(greatest(0, extract(epoch from (least(b.end_time, s.office_end) - greatest(b.start_time, s.office_start))) / 60))
        from break_windows b
        where b.workspace_id = p_ws and not b.paid
      ), 0)
  )::int
  from workspace_settings s where s.workspace_id = p_ws
$$;

-- Expected working minutes for one member: workdays (from joining date, up to the effective end)
-- × window minutes, minus approved leave (half-day leave counts half).
create or replace function fn_expected_minutes(p_ws uuid, p_member uuid, p_start date, p_end date) returns numeric
language sql stable as $$
  with m as (
    select greatest(p_start, coalesce(joined_at, p_start)) as start_d
    from memberships where id = p_member and workspace_id = p_ws
  ),
  days as (
    select wd.day,
      (select case
                when bool_or(lr.kind = 'full_day') then 0
                when bool_or(lr.kind = 'half_day') then 0.5
                else 1 end
       from leave_requests lr
       where lr.membership_id = p_member and lr.status = 'approved'
         and wd.day between lr.start_date and lr.end_date) as factor
    from m, fn_workdays(p_ws, m.start_d, fn_effective_end(p_ws, p_end)) wd
  )
  select coalesce(sum(coalesce(factor, 1)), 0) * fn_window_minutes(p_ws) from days
$$;

-- Per-member attendance counts for a period.
create or replace function fn_attendance_summary(p_ws uuid, p_start date, p_end date)
returns table(
  membership_id uuid,
  expected_days int,
  present_days int,
  on_time_days int,
  late_days int,
  remote_days int,
  half_days int,
  leave_days int,
  absent_days int,
  missing_checkout int,
  tracked_minutes bigint,
  expected_minutes numeric
)
language sql stable as $$
  with eff as (select fn_effective_end(p_ws, p_end) as e, fn_local_today(p_ws) as today),
  m as (
    select id, greatest(p_start, coalesce(joined_at, p_start)) as start_d
    from memberships
    where workspace_id = p_ws and status = 'active' and role <> 'owner'
  ),
  wd as (select day from eff, fn_workdays(p_ws, p_start, eff.e))
  select
    m.id,
    (select count(*) from wd where wd.day >= m.start_d)::int,
    count(a.id) filter (where a.check_in_at is not null and a.approval <> 'rejected')::int,
    count(a.id) filter (where a.status = 'present' and a.approval <> 'rejected')::int,
    count(a.id) filter (where a.status = 'late' and a.approval <> 'rejected')::int,
    count(a.id) filter (where a.mode = 'remote' and a.check_in_at is not null and a.approval <> 'rejected')::int,
    count(a.id) filter (where a.status = 'half_day')::int,
    count(a.id) filter (where a.status = 'on_leave')::int,
    (select count(*) from wd
      where wd.day >= m.start_d
        and not exists (
          select 1 from attendance x
          where x.membership_id = m.id and x.date = wd.day
            and x.status <> 'absent' and x.approval <> 'rejected'
        ))::int,
    count(a.id) filter (
      where a.check_in_at is not null
        and (a.auto_checked_out or (a.check_out_at is null and a.date < (select today from eff)))
    )::int,
    coalesce(sum(a.tracked_minutes) filter (where a.approval <> 'rejected'), 0)::bigint,
    fn_expected_minutes(p_ws, m.id, p_start, p_end)
  from m
  left join attendance a
    on a.membership_id = m.id and a.workspace_id = p_ws and a.date between p_start and p_end
  group by m.id, m.start_d
$$;

-- Performance index ranking. Attendance index = 100 − penalty points (floored at 0);
-- Productivity index = tracked ÷ expected minutes (capped at 100); Performance = average of both.
create or replace function fn_performance_index(p_ws uuid, p_start date, p_end date)
returns table(
  membership_id uuid,
  employee_code text,
  name text,
  department text,
  designation text,
  attendance_index numeric,
  productivity_index numeric,
  performance_index numeric,
  worked_hours numeric,
  expected_hours numeric,
  late_count int,
  absent_count int,
  missing_checkout int,
  half_days int,
  penalty_points numeric
)
language sql stable as $$
  with s as (select scoring from workspace_settings where workspace_id = p_ws),
  base as (
    select sm.*,
      (sm.late_days * coalesce((s.scoring->>'late')::numeric, 0)
        + sm.absent_days * coalesce((s.scoring->>'absent')::numeric, 0)
        + sm.missing_checkout * coalesce((s.scoring->>'missingCheckout')::numeric, 0)
        + sm.half_days * coalesce((s.scoring->>'halfDay')::numeric, 0)) as penalty
    from fn_attendance_summary(p_ws, p_start, p_end) sm, s
  ),
  idx as (
    select b.*,
      greatest(0, 100 - b.penalty) as att_idx,
      case when b.expected_minutes > 0
           then least(100, round(b.tracked_minutes * 100.0 / b.expected_minutes, 1)) end as prod_idx
    from base b
  )
  select
    i.membership_id,
    mb.employee_code,
    u.name,
    d.name,
    g.name,
    round(i.att_idx, 1),
    i.prod_idx,
    round(case when i.prod_idx is null then i.att_idx else (i.att_idx + i.prod_idx) / 2 end, 1),
    round(i.tracked_minutes / 60.0, 1),
    round(i.expected_minutes / 60.0, 1),
    i.late_days,
    i.absent_days,
    i.missing_checkout,
    i.half_days,
    i.penalty
  from idx i
  join memberships mb on mb.id = i.membership_id
  join users u on u.id = mb.user_id
  left join departments d on d.id = mb.department_id
  left join designations g on g.id = mb.designation_id
$$;

-- Does a (possibly recurring) meeting occur on a local date? "Daily" skips the weekend days given.
drop function if exists fn_meeting_occurs(date, recurrence, date, date);
create or replace function fn_meeting_occurs(p_starts date, p_recurrence recurrence, p_until date, p_day date, p_weekend int[] default '{}')
returns boolean
language sql immutable as $$
  select p_day >= p_starts
    and (p_until is null or p_day <= p_until)
    and case p_recurrence
          when 'none' then p_day = p_starts
          when 'daily' then p_day = p_starts or not (extract(dow from p_day)::int = any (p_weekend))
          when 'weekly' then extract(dow from p_day) = extract(dow from p_starts)
          when 'monthly' then extract(day from p_day) = extract(day from p_starts)
        end
$$;
