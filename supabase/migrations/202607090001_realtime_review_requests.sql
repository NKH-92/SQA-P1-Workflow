-- Publish review_requests INSERTs over Realtime so the leader's browser gets
-- instant new-request notifications. postgres_changes enforces RLS per subscriber,
-- so row visibility is unchanged by this migration.
-- Idempotent: skips when already published, and skips (instead of failing) on plain
-- Postgres environments where the supabase_realtime publication does not exist.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'review_requests'
     ) then
    alter publication supabase_realtime add table public.review_requests;
  end if;
end
$$;
