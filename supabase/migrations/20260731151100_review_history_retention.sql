-- Keep the leader workspace focused on active work while preserving a bounded,
-- searchable terminal history. Terminal review data is retained for exactly
-- 365 days and then purged after the daily backup window.

create index if not exists review_requests_terminal_history_idx
  on public.review_requests (
    (case when status = 'withdrawn' then withdrawn_at else closed_at end) desc,
    id desc
  )
  where status in ('approved', 'rejected', 'withdrawn');

-- This is the numeric-id implementation wrapped by public.get_review_bootstrap_v2().
-- Keep the member contract unchanged (pending + six months of approved/rejected),
-- while leaders receive all pending reviews and terminal reviews from the seven
-- KST calendar days including today.
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
          when (select role from public.profiles where id = v_actor_id) = 'leader'
            then array['submitted', 'resubmitted']::text[]
          else array['approved', 'rejected', 'reopened', 'feedback_added', 'feedback_updated', 'feedback_voided']::text[]
        end as relevant_types
    ),
    visible_requests as (
      select request.*
        from public.review_requests request, ctx
       where (ctx.role = 'leader' or request.requester_id = ctx.actor_id)
         and (
           request.status = 'pending'
           or (
             ctx.role = 'leader'
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

revoke all on function private.get_review_bootstrap_v2_numeric_ids()
  from public, anon, authenticated;

-- Leader-only, keyset-paginated terminal history. Search is a literal,
-- case-insensitive substring match across title, description, and requester.
create or replace function public.list_review_history_v1(
  p_status text default null,
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_before_terminal_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot timestamptz := clock_timestamp();
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_status is not null and v_status not in ('approved', 'rejected', 'withdrawn') then
    raise exception using errcode = '22023', message = 'invalid review history status', detail = 'SQA_REVIEW_HISTORY_STATUS_INVALID';
  end if;
  if v_query is not null and char_length(v_query) > 200 then
    raise exception using errcode = '22023', message = 'review history query is too long', detail = 'SQA_REVIEW_HISTORY_QUERY_TOO_LONG';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'invalid review history date range', detail = 'SQA_REVIEW_HISTORY_DATE_INVALID';
  end if;
  if (p_before_terminal_at is null) <> (p_before_id is null) then
    raise exception using errcode = '22023', message = 'incomplete review history cursor', detail = 'SQA_REVIEW_HISTORY_CURSOR_INVALID';
  end if;

  return (
    with terminal_candidates as materialized (
      select
        request.*,
        requester_profile.name as requester_name,
        requester_profile.email as requester_email,
        case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end as terminal_at
      from public.review_requests request
      left join public.profiles requester_profile on requester_profile.id = request.requester_id
      where request.status in ('approved', 'rejected', 'withdrawn')
        and (v_status is null or request.status::text = v_status)
        and case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
            < ((private.sqa_business_date(v_snapshot) - 6)::timestamp at time zone 'Asia/Seoul')
        and case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
            >= v_snapshot - interval '365 days'
        and (
          p_from is null
          or case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
             >= (p_from::timestamp at time zone 'Asia/Seoul')
        )
        and (
          p_to is null
          or case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
             < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
        )
        and (
          v_query is null
          or position(lower(v_query) in lower(request.title)) > 0
          or position(lower(v_query) in lower(request.description)) > 0
          or position(lower(v_query) in lower(coalesce(requester_profile.name, ''))) > 0
        )
        and (
          p_before_terminal_at is null
          or (case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end, request.id)
             < (p_before_terminal_at, p_before_id)
        )
    ),
    bounded as materialized (
      select *
      from terminal_candidates
      order by terminal_at desc, id desc
      limit v_limit + 1
    ),
    page as materialized (
      select *
      from bounded
      order by terminal_at desc, id desc
      limit v_limit
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
                 'profiles', jsonb_build_object('name', author_profile.name)
               )
               order by feedback.created_at asc
             ) as rows
      from public.review_feedback feedback
      left join public.profiles author_profile on author_profile.id = feedback.leader_id
      where feedback.review_request_id in (select id from page)
      group by feedback.review_request_id
    ),
    response_rows as (
      select coalesce(jsonb_agg(
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
          'terminal_at', request.terminal_at,
          'profiles', jsonb_build_object('name', request.requester_name, 'email', request.requester_email),
          'review_feedback', coalesce(feedback_agg.rows, '[]'::jsonb)
        ) order by request.terminal_at desc, request.id desc
      ), '[]'::jsonb) as rows
      from page request
      left join feedback_agg on feedback_agg.review_request_id = request.id
    ),
    cursor_row as (
      select terminal_at, id
      from page
      order by terminal_at desc, id desc
      offset greatest(v_limit - 1, 0)
      limit 1
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', v_snapshot,
      'rows', response_rows.rows,
      'has_more', (select count(*) > v_limit from bounded),
      'next_cursor', case
        when (select count(*) > v_limit from bounded) then (
          select jsonb_build_object('terminal_at', cursor_row.terminal_at, 'id', cursor_row.id)
          from cursor_row
        )
        else null
      end
    )
    from response_rows
  );
end;
$$;

revoke all on function public.list_review_history_v1(text, text, date, date, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_review_history_v1(text, text, date, date, timestamptz, uuid, integer)
  to authenticated;

-- Include whether a comment accompanied a rejection in the compact event.
create or replace function private.record_review_request_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role public.app_role;
  v_event_type text;
  v_metadata jsonb;
begin
  select name, role into v_actor_name, v_actor_role
    from public.profiles where id = v_actor_id;

  if tg_op = 'INSERT' then
    v_event_type := 'submitted';
  elsif new.status = 'approved' then
    v_event_type := 'approved';
  elsif new.status = 'rejected' then
    v_event_type := 'rejected';
  elsif new.status = 'withdrawn' then
    v_event_type := 'withdrawn';
  elsif new.status = 'pending' and v_actor_role = 'member' then
    v_event_type := 'resubmitted';
  elsif new.status = 'pending' then
    v_event_type := 'reopened';
  else
    return new;
  end if;

  v_metadata := jsonb_build_object(
    'review_round', coalesce(new.review_round, 1),
    'estimated', false
  );
  if v_event_type = 'rejected' then
    v_metadata := v_metadata || jsonb_build_object(
      'comment_provided', coalesce(
        nullif(current_setting('sqa.review_rejection_comment_provided', true), '')::boolean,
        false
      )
    );
  end if;

  insert into public.review_events (
    review_request_id, actor_id, actor_name_snapshot, event_type,
    from_status, to_status, occurred_at, metadata
  ) values (
    new.id,
    v_actor_id,
    coalesce(v_actor_name, case when tg_op = 'INSERT' then '요청자' else '시스템' end),
    v_event_type,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    coalesce(new.status_changed_at, clock_timestamp()),
    v_metadata
  );
  return new;
end;
$$;

revoke all on function private.record_review_request_event()
  from public, anon, authenticated;

-- Rejection comments are optional. A supplied comment remains normal feedback;
-- a blank comment creates no feedback row and receives an explicit audit reason.
create or replace function public.reject_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_comment_provided boolean;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_comment is not null and char_length(v_comment) > 2000 then
    raise exception using errcode = '22023', message = 'rejection comment is too long', detail = 'SQA_REVIEW_COMMENT_TOO_LONG';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception using errcode = 'P0001', message = 'review is not pending', detail = 'SQA_REVIEW_NOT_PENDING'; end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;

  v_comment_provided := v_comment is not null;
  perform set_config('sqa.audit_reason', coalesce(v_comment, '댓글 없이 반려'), true);
  perform set_config('sqa.audit_source', 'reject_review_request', true);
  perform set_config('sqa.review_rejection_comment_provided', v_comment_provided::text, true);

  if v_comment_provided then
    insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
    values (p_review_request_id, v_actor_id, 'leader', v_comment);
  end if;

  update public.review_requests
     set status = 'rejected', rejection_count = coalesce(rejection_count, 0) + 1,
         updated_at = clock_timestamp()
   where id = p_review_request_id;

  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id,
    v_request.requester_id,
    'review_request',
    p_review_request_id,
    'status_changed',
    v_request.title || ' 검토요청을 반려했습니다.',
    jsonb_build_object('status', 'rejected', 'comment_provided', v_comment_provided)
  );
end;
$$;

revoke all on function public.reject_review_request(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.reject_review_request(uuid, timestamptz, text)
  to authenticated;

-- Purge terminal review originals after 365 days. Candidate and feedback IDs
-- are frozen before cascading deletes so related activity and both pre-existing
-- and delete-trigger audit rows can be removed in the same transaction.
create or replace function private.purge_expired_review_requests(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_ids uuid[] := array[]::uuid[];
  v_feedback_ids uuid[] := array[]::uuid[];
  v_review_count integer := 0;
  v_feedback_count integer := 0;
  v_activity_count integer := 0;
  v_status_event_count integer := 0;
  v_audit_count integer := 0;
begin
  if p_now is null then
    raise exception using errcode = '22004', message = 'purge timestamp is required', detail = 'SQA_REVIEW_RETENTION_NOW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sqa-review-retention-daily', 0));

  with candidates as materialized (
    select request.id
      from public.review_requests request
     where request.status in ('approved', 'rejected', 'withdrawn')
       and case when request.status = 'withdrawn' then request.withdrawn_at else request.closed_at end
           < p_now - interval '365 days'
     for update
  )
  select coalesce(array_agg(candidate.id), array[]::uuid[])
    into v_request_ids
    from candidates candidate;

  v_review_count := cardinality(v_request_ids);
  if v_review_count = 0 then
    return jsonb_build_object(
      'review_requests', 0,
      'review_feedback', 0,
      'activity_logs', 0,
      'review_status_events', 0,
      'audit_events', 0
    );
  end if;

  select coalesce(array_agg(feedback.id), array[]::uuid[])
    into v_feedback_ids
    from public.review_feedback feedback
   where feedback.review_request_id = any(v_request_ids);
  v_feedback_count := cardinality(v_feedback_ids);

  delete from public.activity_logs activity
   where (activity.entity_type = 'review_request' and activity.entity_id = any(v_request_ids))
      or (activity.entity_type = 'review_feedback' and activity.entity_id = any(v_feedback_ids));
  get diagnostics v_activity_count = row_count;

  delete from private.review_status_events status_event
   where status_event.review_request_id = any(v_request_ids);
  get diagnostics v_status_event_count = row_count;

  perform set_config('sqa.audit_reason', '365일 검토요청 보존기간 만료', true);
  perform set_config('sqa.audit_source', 'review_retention_purge', true);
  delete from public.review_requests request
   where request.id = any(v_request_ids);

  delete from private.audit_events audit
   where (audit.entity_type = 'review_request' and audit.entity_id = any(v_request_ids))
      or (audit.entity_type = 'review_feedback' and audit.entity_id = any(v_feedback_ids));
  get diagnostics v_audit_count = row_count;

  return jsonb_build_object(
    'review_requests', v_review_count,
    'review_feedback', v_feedback_count,
    'activity_logs', v_activity_count,
    'review_status_events', v_status_event_count,
    'audit_events', v_audit_count
  );
end;
$$;

revoke all on function private.purge_expired_review_requests(timestamptz)
  from public, anon, authenticated;
grant execute on function private.purge_expired_review_requests(timestamptz)
  to postgres;

comment on function public.list_review_history_v1(text, text, date, date, timestamptz, uuid, integer) is
  'Leader-only terminal review history: literal search, KST date filters, and (terminal_at,id) keyset pagination.';
comment on function private.purge_expired_review_requests(timestamptz) is
  'Deletes terminal review originals and related operational/audit rows once terminal_at is older than 365 days.';

-- Supabase Cron runs in UTC. 21:00 UTC is 06:00 KST, one hour after the
-- established 05:00 KST database backup window. Reusing the fixed name is an
-- idempotent upsert according to the pg_cron contract.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'sqa-review-retention-daily',
  '0 21 * * *',
  'select private.purge_expired_review_requests();'
);
