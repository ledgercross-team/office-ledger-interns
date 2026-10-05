-- Defence in depth: tenant isolation with Row Level Security.
-- Request-scoped transactions run `set local role ledger_app` + `set_config('app.workspace_id', ...)`
-- (see src/db/index.ts → withWorkspace). The connecting owner role (migrations, auth, cron) is not
-- restricted; ledger_app is, and FORCE makes policies apply even to table owners acting as it.

do $$ begin
  if not exists (select from pg_roles where rolname = 'ledger_app') then
    create role ledger_app nologin;
  end if;
end $$;

do $$ begin
  execute format('grant ledger_app to %I', current_user);
exception when others then null;
end $$;

grant usage on schema public to ledger_app;
grant select, insert, update, delete on all tables in schema public to ledger_app;
grant usage, select on all sequences in schema public to ledger_app;
grant execute on all functions in schema public to ledger_app;

create or replace function app_workspace_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

do $$
declare t text;
begin
  -- every table with a workspace_id column
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'workspace_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I to ledger_app using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())',
      t);
    -- the owner/superuser connection (migrations, auth, jobs) keeps full access
    execute format('drop policy if exists owner_access on %I', t);
    execute format('create policy owner_access on %I to public using (current_user <> ''ledger_app'') with check (current_user <> ''ledger_app'')', t);
  end loop;

  alter table workspaces enable row level security;
  alter table workspaces force row level security;
  drop policy if exists tenant_isolation on workspaces;
  create policy tenant_isolation on workspaces to ledger_app using (id = app_workspace_id()) with check (id = app_workspace_id());
  drop policy if exists owner_access on workspaces;
  create policy owner_access on workspaces to public using (current_user <> 'ledger_app') with check (current_user <> 'ledger_app');
end $$;
