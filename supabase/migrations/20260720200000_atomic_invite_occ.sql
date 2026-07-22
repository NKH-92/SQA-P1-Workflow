-- Close the invite/profile OCC split and require the same active-leader
-- authorization used by every other master SECURITY DEFINER mutation.

create or replace function public.update_allowed_user_if_current(
  p_allowed_user_id uuid,
  p_expected_updated_at timestamptz,
  p_email text,
  p_name text,
  p_role public.app_role,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.allowed_users%rowtype;
  v_linked_profile public.profiles%rowtype;
  v_linked_profile_found boolean := false;
  v_email public.allowed_users.email%type := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'invite name is invalid', detail = 'SQA_INVITE_NAME_INVALID';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using errcode = 'P0001', message = 'invite email is invalid', detail = 'SQA_INVITE_EMAIL_INVALID';
  end if;
  if p_role is null then
    raise exception using errcode = 'P0001', message = 'invite role is required', detail = 'SQA_INVITE_ROLE_REQUIRED';
  end if;

  select * into v_invite
    from public.allowed_users
   where id = p_allowed_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_invite.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  -- Resolve and lock the Auth-linked profile through the pre-edit email. This
  -- remains stable even when this operation also changes the invite email.
  select * into v_linked_profile
    from public.profiles profile
   where lower(profile.email::text) = lower(v_invite.email::text)
   order by profile.id
   limit 1
   for update;
  v_linked_profile_found := found;

  v_changed :=
    v_invite.email is distinct from v_email
    or v_invite.name is distinct from v_name
    or v_invite.role is distinct from p_role
    or (v_linked_profile_found and v_linked_profile.role is distinct from p_role);

  if not v_changed then
    return v_invite.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'update_allowed_user_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.allowed_users
     set email = v_email,
         name = v_name,
         role = p_role
   where id = p_allowed_user_id
   returning updated_at into v_updated_at;

  -- When the email changed, the historical allowed-user trigger searches the
  -- new email and cannot reach the old linked profile. Reconcile its role in
  -- this same transaction; existing last-active-leader triggers still apply.
  if v_linked_profile_found
     and lower(v_invite.email::text) is distinct from lower(v_email::text)
     and v_linked_profile.role is distinct from p_role then
    update public.profiles
       set role = p_role
     where id = v_linked_profile.id;
  end if;

  return v_updated_at;
end;
$$;

revoke all on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid)
  from public, anon, authenticated;
grant execute on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
