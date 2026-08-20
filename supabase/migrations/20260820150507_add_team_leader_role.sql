-- PostgreSQL enum additions must be committed before the value is used by the
-- following migration. Keep this migration intentionally small and append-only.
alter type public.app_role add value if not exists 'team_leader';
