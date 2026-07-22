-- Preserve bigint event identifiers as decimal strings across JSON/JavaScript
-- so cursor paging remains exact above Number.MAX_SAFE_INTEGER.

create function public.list_review_events_page_v2(
  p_review_request_id uuid,
  p_before_id text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before_id bigint;
  v_rows jsonb;
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if not exists (
    select 1
      from public.review_requests request
     where request.id = p_review_request_id
       and (public.is_active_leader() or request.requester_id = auth.uid())
  ) then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  if p_before_id is not null then
    if p_before_id !~ '^[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'invalid event cursor', detail = 'SQA_REVIEW_CURSOR_INVALID';
    end if;
    begin
      v_before_id := p_before_id::bigint;
    exception when numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'invalid event cursor', detail = 'SQA_REVIEW_CURSOR_INVALID';
    end;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', page.id::text,
      'review_request_id', page.review_request_id,
      'actor_id', page.actor_id,
      'actor_name_snapshot', page.actor_name_snapshot,
      'event_type', page.event_type,
      'from_status', page.from_status,
      'to_status', page.to_status,
      'occurred_at', page.occurred_at,
      'metadata', page.metadata,
      'transaction_id', page.transaction_id::text
    ) order by page.id desc
  ), '[]'::jsonb)
    into v_rows
    from (
      select event.*
        from public.review_events event
       where event.review_request_id = p_review_request_id
         and (v_before_id is null or event.id < v_before_id)
       order by event.id desc
       limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) page;

  return v_rows;
end;
$$;

revoke all on function public.list_review_events_page_v2(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.list_review_events_page_v2(uuid, text, integer)
  to authenticated;

comment on function public.list_review_events_page_v2(uuid, text, integer) is
  'Exact decimal-string cursor page for bigint review event identifiers.';

notify pgrst, 'reload schema';
