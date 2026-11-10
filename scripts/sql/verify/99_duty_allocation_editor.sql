do $verify$
declare
  v_create regprocedure := to_regprocedure('public.create_duty_with_assignments(text,uuid,text,text,uuid[],uuid)');
  v_save regprocedure := to_regprocedure('public.save_duty_with_assignments_if_current(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid)');
  v_write regprocedure := to_regprocedure('private.write_duty_allocation(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid)');
begin
  if v_create is null or v_save is null or v_write is null then
    raise exception 'SQA_DB_READY_DUTY_ALLOCATION_RPC';
  end if;
  if not has_function_privilege('authenticated', v_create, 'execute')
    or not has_function_privilege('authenticated', v_save, 'execute')
    or not has_function_privilege('authenticated', v_write, 'execute')
    or has_function_privilege('anon', v_create, 'execute')
    or has_function_privilege('anon', v_save, 'execute')
    or has_function_privilege('anon', v_write, 'execute')
    or has_schema_privilege('authenticated', 'private', 'usage')
    or exists (select 1 from pg_proc where oid in (v_create, v_save) and prosecdef)
    or not exists (select 1 from pg_proc where oid = v_write and prosecdef) then
    raise exception 'SQA_DB_READY_DUTY_ALLOCATION_PRIVILEGES';
  end if;
end;
$verify$;
