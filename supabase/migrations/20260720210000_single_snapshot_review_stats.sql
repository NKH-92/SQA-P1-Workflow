-- Return the entire statistics page (overall KPIs, requester rows, and every
-- monthly row) from one PostgreSQL statement snapshot.

alter function public.get_review_statistics_v2(date, date, uuid, public.review_status)
  rename to get_review_statistics_v2_single_scope;
alter function public.get_review_statistics_v2_single_scope(date, date, uuid, public.review_status)
  set schema private;
revoke all on function private.get_review_statistics_v2_single_scope(date, date, uuid, public.review_status)
  from public, anon, authenticated;
alter function private.get_review_statistics_v2_single_scope(date, date, uuid, public.review_status) stable;

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

  return (
    with overall as materialized (
      select private.get_review_statistics_v2_single_scope(
        p_from, p_to, p_requester_id, p_status
      ) as envelope
    ),
    month_starts as (
      select month_start::date as month_start
        from generate_series(
          date_trunc('month', p_from::timestamp),
          date_trunc('month', p_to::timestamp),
          interval '1 month'
        ) month_start
    ),
    monthly_event_counts as (
      select date_trunc('month', event.occurred_at at time zone 'Asia/Seoul')::date as month_start,
             count(*) filter (where event.event_type = 'submitted')::integer as new_requests,
             count(*) filter (where event.event_type = 'resubmitted')::integer as resubmissions,
             count(*) filter (where event.event_type = 'approved')::integer as approvals,
             count(*) filter (where event.event_type = 'rejected')::integer as rejections
        from public.review_events event
        join public.review_requests request on request.id = event.review_request_id
       where event.occurred_at >= (p_from::timestamp at time zone 'Asia/Seoul')
         and event.occurred_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
         and event.event_type in ('submitted', 'resubmitted', 'approved', 'rejected')
         and (p_requester_id is null or request.requester_id = p_requester_id)
         and (p_status is null or request.status = p_status)
       group by 1
    ),
    monthly as (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'month', to_char(month.month_start, 'YYYY-MM'),
          'new_requests', coalesce(events.new_requests, 0),
          'resubmissions', coalesce(events.resubmissions, 0),
          'approvals', coalesce(events.approvals, 0),
          'rejections', coalesce(events.rejections, 0),
          'month_end_backlog', coalesce((
            select (entry.value ->> 'backlog_count')::integer
              from jsonb_array_elements(overall.envelope -> 'month_end_backlog') entry(value)
             where entry.value ->> 'month' = to_char(month.month_start, 'YYYY-MM')
             limit 1
          ), 0)
        ) order by month.month_start
      ), '[]'::jsonb) as rows
        from month_starts month
        left join monthly_event_counts events using (month_start)
        cross join overall
    )
    select jsonb_set(overall.envelope, '{monthly_breakdown}', monthly.rows, true)
      from overall, monthly
  );
end;
$$;

revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status)
  from public, anon, authenticated;
grant execute on function public.get_review_statistics_v2(date, date, uuid, public.review_status)
  to authenticated;

comment on function public.get_review_statistics_v2(date, date, uuid, public.review_status) is
  'Leader-only single-statement statistics page envelope with overall, requester, and monthly rows.';

notify pgrst, 'reload schema';
