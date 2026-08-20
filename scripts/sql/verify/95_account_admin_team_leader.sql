-- Account administration and team-leader readiness. This gate verifies the
-- database authorization boundary independently from the frontend controls.
do $verify$
declare
  unguarded_table text;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260820150507'
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260820150511'
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260820161242'
  ) then
    raise exception 'SQA_DB_READY_ACCOUNT_ADMIN_MIGRATION';
  end if;

  if not exists (
    select 1 from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'app_role'
      and enum_value.enumlabel = 'team_leader'
  ) then
    raise exception 'SQA_DB_READY_TEAM_LEADER_ROLE';
  end if;

  if to_regclass('private.account_password_change_state') is null
     or to_regprocedure('public.current_session_is_valid()') is null
     or to_regprocedure('public.can_manage_team_data()') is null
     or to_regprocedure('public.prepare_password_reset(uuid,text,uuid)') is null
     or to_regprocedure('public.cancel_password_reset(uuid,uuid)') is null
     or to_regprocedure('public.prepare_own_password_change(uuid)') is null
     or to_regprocedure('public.cancel_own_password_change(uuid)') is null then
    raise exception 'SQA_DB_READY_ACCOUNT_ADMIN_FUNCTIONS';
  end if;

  if pg_get_functiondef('private.get_review_bootstrap_v2_numeric_ids()'::regprocedure)
       not like '%ctx.role in (''leader'', ''team_leader'')%'
     or pg_get_functiondef('public.mark_review_seen(uuid)'::regprocedure)
       not like '%v_role in (''leader'', ''team_leader'')%'
     or pg_get_functiondef('public.mark_all_relevant_reviews_seen()'::regprocedure)
       not like '%v_role in (''leader'', ''team_leader'')%' then
    raise exception 'SQA_DB_READY_TEAM_LEADER_REVIEW_SCOPE';
  end if;

  select cls.relname into unguarded_table
    from pg_class cls
    join pg_namespace namespace on namespace.oid = cls.relnamespace
   where namespace.nspname = 'public'
     and cls.relkind in ('r', 'p')
     and cls.relname <> 'review_read_receipts'
     and not exists (
       select 1
         from pg_trigger trigger
        where trigger.tgrelid = cls.oid
          and trigger.tgname = 'reject_team_leader_write'
          and not trigger.tgisinternal
     )
   limit 1;
  if unguarded_table is not null then
    raise exception 'SQA_DB_READY_TEAM_LEADER_WRITE_GUARD:%', unguarded_table;
  end if;

  if has_function_privilege('anon', 'public.can_manage_team_data()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.can_manage_team_data()', 'EXECUTE')
     or has_table_privilege('authenticated', 'private.account_password_change_state', 'SELECT') then
    raise exception 'SQA_DB_READY_ACCOUNT_ADMIN_ACL';
  end if;
end;
$verify$;
