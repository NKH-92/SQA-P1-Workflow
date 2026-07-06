-- Revoke PUBLIC execute on internal helpers (anon inherits PUBLIC in Supabase).

revoke all on function public.can_use_app() from public;
grant execute on function public.can_use_app() to authenticated;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

revoke all on function public.is_active_leader() from public;
grant execute on function public.is_active_leader() to authenticated;

revoke all on function public.is_active_self() from public;
grant execute on function public.is_active_self() to authenticated;

revoke all on function public.is_leader() from public;
grant execute on function public.is_leader() to authenticated;

revoke all on function public.handle_allowed_user_saved() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.validate_assignment_user_active() from public;
revoke all on function public.validate_review_attachment_url() from public;
