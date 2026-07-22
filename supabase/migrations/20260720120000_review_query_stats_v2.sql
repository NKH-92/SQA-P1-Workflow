-- Bounded review data access and server-computed statistics.
--
-- Problem: the browser previously paginated through the *entire* review_events
-- and review_read_receipts tables on every refresh (see fetchAllPages() calls
-- removed from src/data/fetch/reviewQueries.ts in this same change). That cost
-- grows linearly with total history, not with what a screen actually renders.
--
-- This migration adds three new, additive RPCs. No existing table, column,
-- trigger, policy, or RPC signature is modified (D-06 append-only contract):
--
--   1. get_review_bootstrap_v2()      - one snapshot transaction returning the
--      same "pending + recent closed" requests the client already renders,
--      plus only the single latest role-relevant event per request (enough
--      for unread badges) and the caller's own read receipts.
--   2. list_review_events_page(...)   - cursor-paginated (id DESC, no OFFSET)
--      full event history for one review, fetched on demand when a user
--      opens a detail view, mirroring list_audit_events().
--   3. get_review_statistics_v2(...)  - leader-only server-side aggregation
--      over Asia/Seoul business-day boundaries (private.sqa_business_date),
--      returning counts only (never raw event rows), with current pending
--      and month-end backlog reported as distinct fields per D-01.

-- Composite index for "all events for one review, in reverse chronological
-- business time" -- used by the month-end backlog point-in-time lookup in
-- get_review_statistics_v2 and available as a covering index for future
-- history queries ordered by occurred_at rather than id.
create index if not exists review_events_request_occurred_idx
  on public.review_events(review_request_id, occurred_at desc, id desc);

create or replace function public.get_review_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_snapshot timestamptz := clock_timestamp();
  v_relevant_types text[];
  v_requests jsonb := '[]'::jsonb;
  v_request_ids uuid[] := array[]::uuid[];
  v_events jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_unread integer := 0;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select role into v_role from public.profiles where id = v_actor_id;

  -- "Pending + recent closed" mirrors the .or() filter previously issued from
  -- the browser (src/data/fetch/reviewQueries.ts REVIEW_HISTORY_MONTHS), and
  -- the leader/requester scope mirrors review_requests_select_self_or_leader.
  with visible_requests as (
    select request.*
      from public.review_requests request
     where (public.is_active_leader() or request.requester_id = v_actor_id)
       and (
         request.status = 'pending'
         or (request.status in ('approved', 'rejected') and request.closed_at >= v_snapshot - interval '6 months')
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
  )
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
    ), '[]'::jsonb),
    coalesce(array_agg(request.id), array[]::uuid[])
    into v_requests, v_request_ids
    from visible_requests request
    left join public.profiles requester_profile on requester_profile.id = request.requester_id
    left join feedback_agg on feedback_agg.review_request_id = request.id;

  -- Relevance mirrors src/lib/readState.ts leaderRelevantEvents/memberRelevantEvents
  -- exactly, so the existing client-side isReviewUnread()/countUnreadReviews()
  -- selectors keep working unchanged against this bounded event set.
  v_relevant_types := case
    when v_role = 'leader' then array['submitted', 'resubmitted']
    else array['approved', 'rejected', 'reopened', 'feedback_added', 'feedback_updated', 'feedback_voided']
  end;

  with latest_events as (
    select distinct on (event.review_request_id) event.*
      from public.review_events event
     where event.review_request_id = any(v_request_ids)
       and event.event_type = any(v_relevant_types)
     order by event.review_request_id, event.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id, 'review_request_id', event.review_request_id, 'actor_id', event.actor_id,
      'actor_name_snapshot', event.actor_name_snapshot, 'event_type', event.event_type,
      'from_status', event.from_status, 'to_status', event.to_status,
      'occurred_at', event.occurred_at, 'metadata', event.metadata, 'transaction_id', event.transaction_id
    )), '[]'::jsonb)
    into v_events
    from latest_events event;

  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', receipt.user_id, 'review_request_id', receipt.review_request_id,
      'last_seen_event_id', receipt.last_seen_event_id, 'read_at', receipt.read_at
    )), '[]'::jsonb)
    into v_receipts
    from public.review_read_receipts receipt
   where receipt.user_id = v_actor_id
     and receipt.review_request_id = any(v_request_ids);

  with latest_events as (
    select distinct on (event.review_request_id) event.review_request_id, event.id as latest_id
      from public.review_events event
     where event.review_request_id = any(v_request_ids)
       and event.event_type = any(v_relevant_types)
     order by event.review_request_id, event.id desc
  )
  select count(*) into v_unread
    from latest_events latest
    left join public.review_read_receipts receipt
      on receipt.user_id = v_actor_id and receipt.review_request_id = latest.review_request_id
   where receipt.last_seen_event_id is null or receipt.last_seen_event_id < latest.latest_id;

  return jsonb_build_object(
    'schema_version', 2,
    'snapshot_at', v_snapshot,
    'requests', v_requests,
    'events', v_events,
    'read_receipts', v_receipts,
    'unread_count', v_unread
  );
end;
$$;

create or replace function public.list_review_events_page(
  p_review_request_id uuid,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  review_request_id uuid,
  actor_id uuid,
  actor_name_snapshot text,
  event_type text,
  from_status public.review_status,
  to_status public.review_status,
  occurred_at timestamptz,
  metadata jsonb,
  transaction_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  -- Visibility mirrors review_events_select_relevant exactly (harden_review_workflow.sql).
  if not exists (
    select 1
      from public.review_requests request
     where request.id = p_review_request_id
       and (public.is_active_leader() or request.requester_id = auth.uid())
  ) then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;

  return query
  select event.id, event.review_request_id, event.actor_id, event.actor_name_snapshot,
         event.event_type, event.from_status, event.to_status, event.occurred_at,
         event.metadata, event.transaction_id
    from public.review_events event
   where event.review_request_id = p_review_request_id
     and (p_before_id is null or event.id < p_before_id)
   order by event.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.get_review_statistics_v2(
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
declare
  v_generated_at timestamptz := clock_timestamp();
  v_event_counts jsonb;
  v_pending_count integer;
  v_backlog jsonb;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = 'P0001', message = 'invalid statistics range', detail = 'SQA_STATS_RANGE_INVALID';
  end if;

  -- D-01/D-02: submitted/resubmitted/approved/rejected are counted from the
  -- authoritative event ledger using the Asia/Seoul business-day boundary,
  -- never from browser-local dates or a bare `occurred_at::date` UTC cast.
  select jsonb_build_object(
    'new_requests', count(*) filter (where event.event_type = 'submitted'),
    'resubmissions', count(*) filter (where event.event_type = 'resubmitted'),
    'approvals', count(*) filter (where event.event_type = 'approved'),
    'rejections', count(*) filter (where event.event_type = 'rejected')
  ) into v_event_counts
    from public.review_events event
    join public.review_requests request on request.id = event.review_request_id
   where private.sqa_business_date(event.occurred_at) >= p_from
     and private.sqa_business_date(event.occurred_at) <= p_to
     and event.event_type in ('submitted', 'resubmitted', 'approved', 'rejected')
     and (p_requester_id is null or request.requester_id = p_requester_id)
     and (p_status is null or request.status = p_status);

  -- Current pending backlog is a current-state snapshot (D-01): it is
  -- intentionally independent of p_from/p_to so it can never silently
  -- disagree with the "현재 대기" count shown elsewhere in the app.
  select count(*) into v_pending_count
    from public.review_requests request
   where request.status = 'pending'
     and (p_requester_id is null or request.requester_id = p_requester_id)
     and (p_status is null or request.status = p_status);

  -- Month-end backlog: for every calendar month overlapping [p_from, p_to],
  -- reconstruct each request's status as of that Asia/Seoul month-end business
  -- date from the event ledger (latest status-changing event at/before that
  -- date). Requests created on/before month-end with no prior status event are
  -- treated as pending (coalesce to pending) — they are backlog until first
  -- decision.
  with month_starts as (
    select generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date as month_start
  ),
  month_bounds as (
    select month_start, (month_start + interval '1 month' - interval '1 day')::date as month_end
      from month_starts
  ),
  scoped_requests as (
    select request.*
      from public.review_requests request
     where (p_requester_id is null or request.requester_id = p_requester_id)
       and (p_status is null or request.status = p_status)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', to_char(bound.month_start, 'YYYY-MM'),
      'business_date', bound.month_end,
      'backlog_count', (
        select count(*)
          from scoped_requests request
          left join lateral (
            -- Only status-transition events (to_status is not null) count; a
            -- feedback_added/updated/voided event never changes review status,
            -- so it must not be mistaken for "the latest state" at month end.
            select event.to_status
              from public.review_events event
             where event.review_request_id = request.id
               and event.to_status is not null
               and private.sqa_business_date(event.occurred_at) <= bound.month_end
             order by event.occurred_at desc, event.id desc
             limit 1
          ) as_of_month_end on true
         where private.sqa_business_date(request.created_at) <= bound.month_end
           and coalesce(as_of_month_end.to_status, 'pending'::public.review_status) = 'pending'
      )
    )
    order by bound.month_start
  ), '[]'::jsonb)
  into v_backlog
  from month_bounds bound;

  return jsonb_build_object(
    'schema_version', 2,
    'timezone', 'Asia/Seoul',
    'generated_at', v_generated_at,
    'from', p_from,
    'to', p_to,
    'requester_id', p_requester_id,
    'status', p_status,
    'new_requests', coalesce(v_event_counts ->> 'new_requests', '0')::integer,
    'resubmissions', coalesce(v_event_counts ->> 'resubmissions', '0')::integer,
    'approvals', coalesce(v_event_counts ->> 'approvals', '0')::integer,
    'rejections', coalesce(v_event_counts ->> 'rejections', '0')::integer,
    'pending_count', v_pending_count,
    'month_end_backlog', v_backlog
  );
end;
$$;

revoke all on function public.get_review_bootstrap_v2() from public;
revoke all on function public.get_review_bootstrap_v2() from anon;
grant execute on function public.get_review_bootstrap_v2() to authenticated;

revoke all on function public.list_review_events_page(uuid, bigint, integer) from public;
revoke all on function public.list_review_events_page(uuid, bigint, integer) from anon;
grant execute on function public.list_review_events_page(uuid, bigint, integer) to authenticated;

revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from public;
revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from anon;
grant execute on function public.get_review_statistics_v2(date, date, uuid, public.review_status) to authenticated;

comment on function public.get_review_bootstrap_v2() is
  'Single-snapshot review initial-fetch envelope (schema_version 2): pending+recent-closed requests, only the latest role-relevant event per request, the caller own read receipts, and an authoritative unread_count.';
comment on function public.list_review_events_page(uuid, bigint, integer) is
  'Cursor-paginated (id DESC, no OFFSET) full event history for one review, limit clamped to 1-100.';
comment on function public.get_review_statistics_v2(date, date, uuid, public.review_status) is
  'Leader-only server-aggregated review statistics over Asia/Seoul business-day boundaries; never returns raw event rows; separates current pending from month-end backlog.';
