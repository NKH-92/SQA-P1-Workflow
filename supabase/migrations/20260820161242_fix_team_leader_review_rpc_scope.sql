-- Team leaders share the complete review workspace read model and personal
-- read-receipt behavior. Business mutations remain blocked by the authoritative
-- public-table trigger introduced in 20260820150511.

create or replace function private.get_review_bootstrap_v2_numeric_ids()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    with ctx as (
      select
        v_actor_id as actor_id,
        (select role from public.profiles where id = v_actor_id) as role,
        clock_timestamp() as snapshot,
        case
          when (select role from public.profiles where id = v_actor_id) in ('leader', 'team_leader')
            then array['submitted', 'resubmitted']::text[]
          else array['approved', 'rejected', 'reopened', 'feedback_added', 'feedback_updated', 'feedback_voided']::text[]
        end as relevant_types
    ),
    visible_requests as (
      select request.*
        from public.review_requests request, ctx
       where (ctx.role in ('leader', 'team_leader') or request.requester_id = ctx.actor_id)
         and (
           request.status = 'pending'
           or (
             ctx.role in ('leader', 'team_leader')
             and request.status in ('approved', 'rejected', 'withdrawn')
             and case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
                 >= ((private.sqa_business_date(ctx.snapshot) - 6)::timestamp at time zone 'Asia/Seoul')
           )
           or (
             ctx.role = 'member'
             and request.status in ('approved', 'rejected')
             and request.closed_at >= ctx.snapshot - interval '6 months'
           )
         )
    ),
    feedback_agg as (
      select feedback.review_request_id,
             jsonb_agg(
               jsonb_build_object(
                 'id', feedback.id,
                 'review_request_id', feedback.review_request_id,
                 'leader_id', feedback.leader_id,
                 'author_role', feedback.author_role,
                 'comment', feedback.comment,
                 'created_at', feedback.created_at,
                 'updated_at', feedback.updated_at,
                 'voided_at', feedback.voided_at,
                 'voided_by', feedback.voided_by,
                 'void_reason', feedback.void_reason,
                 'profiles', jsonb_build_object('name', leader_profile.name)
               )
               order by feedback.created_at asc
             ) as feedback_json
        from public.review_feedback feedback
        left join public.profiles leader_profile on leader_profile.id = feedback.leader_id
       where feedback.review_request_id in (select id from visible_requests)
       group by feedback.review_request_id
    ),
    request_rows as (
      select
        coalesce(jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'requester_id', request.requester_id,
            'title', request.title,
            'description', request.description,
            'due_date', request.due_date,
            'status', request.status,
            'review_round', request.review_round,
            'rejection_count', request.rejection_count,
            'last_submitted_at', request.last_submitted_at,
            'status_changed_at', request.status_changed_at,
            'closed_at', request.closed_at,
            'withdrawn_at', request.withdrawn_at,
            'withdrawn_by', request.withdrawn_by,
            'withdrawal_reason', request.withdrawal_reason,
            'created_at', request.created_at,
            'updated_at', request.updated_at,
            'profiles', jsonb_build_object('name', requester_profile.name, 'email', requester_profile.email),
            'review_feedback', coalesce(feedback_agg.feedback_json, '[]'::jsonb)
          )
          order by request.created_at desc
        ), '[]'::jsonb) as requests,
        coalesce(array_agg(request.id), array[]::uuid[]) as request_ids
        from visible_requests request
        left join public.profiles requester_profile on requester_profile.id = request.requester_id
        left join feedback_agg on feedback_agg.review_request_id = request.id
    ),
    latest_events as (
      select distinct on (event.review_request_id) event.*
        from public.review_events event
        cross join request_rows
        cross join ctx
       where event.review_request_id = any(request_rows.request_ids)
         and event.event_type = any(ctx.relevant_types)
       order by event.review_request_id, event.id desc
    ),
    event_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', event.id, 'review_request_id', event.review_request_id, 'actor_id', event.actor_id,
          'actor_name_snapshot', event.actor_name_snapshot, 'event_type', event.event_type,
          'from_status', event.from_status, 'to_status', event.to_status,
          'occurred_at', event.occurred_at, 'metadata', event.metadata, 'transaction_id', event.transaction_id
        )), '[]'::jsonb) as events
        from latest_events event
    ),
    receipt_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', receipt.user_id, 'review_request_id', receipt.review_request_id,
          'last_seen_event_id', receipt.last_seen_event_id, 'read_at', receipt.read_at
        )), '[]'::jsonb) as receipts
        from public.review_read_receipts receipt
        cross join request_rows
        cross join ctx
       where receipt.user_id = ctx.actor_id
         and receipt.review_request_id = any(request_rows.request_ids)
    ),
    unread_rows as (
      select count(*)::integer as unread_count
        from latest_events latest
        cross join ctx
        left join public.review_read_receipts receipt
          on receipt.user_id = ctx.actor_id and receipt.review_request_id = latest.review_request_id
       where receipt.last_seen_event_id is null or receipt.last_seen_event_id < latest.id
    )
    select jsonb_build_object(
      'schema_version', 2,
      'snapshot_at', ctx.snapshot,
      'requests', request_rows.requests,
      'events', event_rows.events,
      'read_receipts', receipt_rows.receipts,
      'unread_count', unread_rows.unread_count
    )
      from ctx, request_rows, event_rows, receipt_rows, unread_rows
  );
end;
$$;

create or replace function public.mark_review_seen(p_review_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_latest_event_id bigint;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select role into v_role from public.profiles where id = v_actor_id;
  if not exists (
    select 1 from public.review_requests request
     where request.id = p_review_request_id
       and (v_role in ('leader', 'team_leader') or request.requester_id = v_actor_id)
  ) then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  select max(event.id) into v_latest_event_id
    from public.review_events event
   where event.review_request_id = p_review_request_id
     and ((v_role in ('leader', 'team_leader') and event.event_type in ('submitted', 'resubmitted'))
       or (v_role = 'member' and event.event_type in ('feedback_added', 'feedback_updated', 'feedback_voided', 'approved', 'rejected', 'reopened')));
  if v_latest_event_id is not null then
    insert into public.review_read_receipts (user_id, review_request_id, last_seen_event_id, read_at)
    values (v_actor_id, p_review_request_id, v_latest_event_id, clock_timestamp())
    on conflict (user_id, review_request_id) do update
      set last_seen_event_id = greatest(review_read_receipts.last_seen_event_id, excluded.last_seen_event_id),
          read_at = excluded.read_at;
  end if;
  return v_latest_event_id;
end;
$$;

create or replace function public.mark_all_relevant_reviews_seen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_count integer;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select role into v_role from public.profiles where id = v_actor_id;
  insert into public.review_read_receipts (user_id, review_request_id, last_seen_event_id, read_at)
  select v_actor_id, event.review_request_id, max(event.id), clock_timestamp()
    from public.review_events event
    join public.review_requests request on request.id = event.review_request_id
   where (v_role in ('leader', 'team_leader') or request.requester_id = v_actor_id)
     and ((v_role in ('leader', 'team_leader') and event.event_type in ('submitted', 'resubmitted'))
       or (v_role = 'member' and event.event_type in ('feedback_added', 'feedback_updated', 'feedback_voided', 'approved', 'rejected', 'reopened')))
   group by event.review_request_id
  on conflict (user_id, review_request_id) do update
    set last_seen_event_id = greatest(review_read_receipts.last_seen_event_id, excluded.last_seen_event_id),
        read_at = excluded.read_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.get_review_bootstrap_v2_numeric_ids() from public, anon, authenticated;
revoke all on function public.mark_review_seen(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_relevant_reviews_seen() from public, anon, authenticated;
grant execute on function public.mark_review_seen(uuid) to authenticated;
grant execute on function public.mark_all_relevant_reviews_seen() to authenticated;

comment on function private.get_review_bootstrap_v2_numeric_ids() is
  'Bounded review bootstrap for member self-scope and leader/team_leader workspace viewers.';
