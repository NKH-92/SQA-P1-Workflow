\set ON_ERROR_STOP on

-- Read-only post-migration diagnostics. Extension-owned routines are reported
-- separately; effective anon EXECUTE remains forbidden for every application
-- routine in the exposed public schema.
with public_routines as (
  select
    function.oid,
    function.oid::pg_catalog.regprocedure as signature,
    pg_catalog.has_function_privilege('anon', function.oid, 'EXECUTE') as anon_can_execute,
    exists (
      select 1
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_extension extension
          on extension.oid = dependency.refobjid
       where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         and dependency.objid = function.oid
         and dependency.objsubid = 0
         and dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
         and dependency.refobjsubid = 0
         and dependency.deptype = 'e'
    ) as extension_member
  from pg_catalog.pg_proc function
  where function.pronamespace = 'public'::pg_catalog.regnamespace
), routine_summary as (
  select
    count(*) filter (where anon_can_execute and not extension_member) as application_anon_routine_count,
    count(*) filter (where anon_can_execute and extension_member) as extension_anon_routine_count,
    coalesce(
      pg_catalog.jsonb_agg(signature::text order by signature::text)
        filter (where anon_can_execute and not extension_member),
      '[]'::pg_catalog.jsonb
    ) as application_anon_routines
  from public_routines
), state as (
  select
    exists (
      select 1 from supabase_migrations.schema_migrations
       where version = '20260718073243'
    ) as stage_b_recorded,
    exists (
      select 1 from supabase_migrations.schema_migrations
       where version = '20260718123250'
    ) as follow_up_recorded,
    pg_catalog.to_regprocedure(
      'public.update_review_request_status(uuid,public.review_status)'
    ) is null as obsolete_rpc_absent,
    routine_summary.*
  from routine_summary
)
select
  stage_b_recorded,
  follow_up_recorded,
  obsolete_rpc_absent,
  application_anon_routine_count,
  extension_anon_routine_count,
  application_anon_routines,
  stage_b_recorded
    and follow_up_recorded
    and obsolete_rpc_absent
    and application_anon_routine_count = 0
    as review_hardening_followup_gate
from state;
