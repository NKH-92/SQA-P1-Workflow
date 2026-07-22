-- Review statistics and leader snapshot corrective migration.
-- Preserve the public RPC signatures while adding an authoritative requester
-- breakdown, bounding current-state pending by request creation date, and
-- exposing active leader membership inside the required core snapshot.

create index if not exists review_requests_created_at_idx
  on public.review_requests(created_at, requester_id, status);

alter function public.get_review_statistics_v2(date, date, uuid, public.review_status)
  rename to get_review_statistics_v2_legacy;
alter function public.get_review_statistics_v2_legacy(date, date, uuid, public.review_status)
  set schema private;
revoke all on function private.get_review_statistics_v2_legacy(date, date, uuid, public.review_status) from public;
revoke all on function private.get_review_statistics_v2_legacy(date, date, uuid, public.review_status) from anon;
revoke all on function private.get_review_statistics_v2_legacy(date, date, uuid, public.review_status) from authenticated;
alter function private.get_review_statistics_v2_legacy(date, date, uuid, public.review_status) stable;

create function public.get_review_statistics_v2(
  p_from date,
  p_to date,
  p_requester_id uuid default null,
  p_status public.review_status default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = 'P0001', message = 'invalid statistics range', detail = 'SQA_STATS_RANGE_INVALID';
  end if;

  -- One final statement gives the legacy event/backlog aggregates and the new
  -- current/requester aggregates the same PostgreSQL statement snapshot.
  return (
  with legacy as (
    select private.get_review_statistics_v2_legacy(p_from, p_to, p_requester_id, p_status) as envelope
  ),
  scoped_events as (
    select request.requester_id, event.event_type
      from public.review_events event
      join public.review_requests request on request.id = event.review_request_id
     where private.sqa_business_date(event.occurred_at) between p_from and p_to
       and event.event_type in ('submitted', 'resubmitted', 'approved', 'rejected')
       and (p_requester_id is null or request.requester_id = p_requester_id)
       and (p_status is null or request.status = p_status)
  ),
  event_counts as (
    select requester_id,
           count(*) filter (where event_type = 'submitted')::integer as new_requests,
           count(*) filter (where event_type = 'resubmitted')::integer as resubmissions,
           count(*) filter (where event_type = 'approved')::integer as approvals,
           count(*) filter (where event_type = 'rejected')::integer as rejections
      from scoped_events
     group by requester_id
  ),
  scoped_current_requests as (
    select request.requester_id, request.status
      from public.review_requests request
     where request.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
       and request.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
       and (p_requester_id is null or request.requester_id = p_requester_id)
       and (p_status is null or request.status = p_status)
  ),
  pending_counts as (
    select requester_id, count(*) filter (where status = 'pending')::integer as pending_count
      from scoped_current_requests
     group by requester_id
  ),
  pending_total as (
    select count(*) filter (where status = 'pending')::integer as pending_count
      from scoped_current_requests
  ),
  requester_ids as (
    select requester_id from event_counts
    union
    select requester_id from scoped_current_requests
  ),
  requester_breakdown as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'requester_id', ids.requester_id,
        'requester_name', coalesce(profile.name, '알 수 없는 요청자'),
        'requester_inactive', coalesce(not profile.is_active, true),
        'new_requests', coalesce(events.new_requests, 0),
        'resubmissions', coalesce(events.resubmissions, 0),
        'approvals', coalesce(events.approvals, 0),
        'rejections', coalesce(events.rejections, 0),
        'pending_count', coalesce(pending.pending_count, 0)
      ) order by coalesce(profile.name, '알 수 없는 요청자'), ids.requester_id
    ), '[]'::jsonb) as rows
      from requester_ids ids
      left join event_counts events on events.requester_id = ids.requester_id
      left join pending_counts pending on pending.requester_id = ids.requester_id
      left join public.profiles profile on profile.id = ids.requester_id
  )
  select jsonb_set(
    jsonb_set(legacy.envelope, '{pending_count}', to_jsonb(pending_total.pending_count), true),
    '{requester_breakdown}', requester_breakdown.rows, true
  )
    from legacy, pending_total, requester_breakdown
  );
end;
$$;

revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from public;
revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from anon;
grant execute on function public.get_review_statistics_v2(date, date, uuid, public.review_status) to authenticated;

comment on function public.get_review_statistics_v2(date, date, uuid, public.review_status) is
  'Leader-only review statistics: selected-range current pending, period events, authoritative requester breakdown, and month-end backlog; raw events are never returned.';

alter function public.get_core_bootstrap_v2()
  rename to get_core_bootstrap_v1_legacy;
alter function public.get_core_bootstrap_v1_legacy()
  set schema private;
revoke all on function private.get_core_bootstrap_v1_legacy() from public;
revoke all on function private.get_core_bootstrap_v1_legacy() from anon;
revoke all on function private.get_core_bootstrap_v1_legacy() from authenticated;
alter function private.get_core_bootstrap_v1_legacy() stable;

create function public.get_core_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    with legacy as (
      select private.get_core_bootstrap_v1_legacy() as envelope
    ),
    leader_profiles as (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', profile.id, 'name', profile.name)
        order by profile.name, profile.id
      ), '[]'::jsonb) as rows
        from public.profiles profile
       where profile.role = 'leader'
         and profile.is_active = true
    )
    select jsonb_set(
      jsonb_set(legacy.envelope, '{schema_version}', '2'::jsonb, true),
      '{data,leader_profiles}', leader_profiles.rows, true
    )
      from legacy, leader_profiles
  );
end;
$$;

revoke all on function public.get_core_bootstrap_v2() from public;
revoke all on function public.get_core_bootstrap_v2() from anon;
grant execute on function public.get_core_bootstrap_v2() to authenticated;

comment on function public.get_core_bootstrap_v2() is
  'Required core bootstrap schema_version 2; includes authoritative active leader membership so optional-view failures cannot resurrect demoted or inactive leaders.';
