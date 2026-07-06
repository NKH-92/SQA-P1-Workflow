-- Harden audit table RLS, leader view invoker semantics, and revoke anon RPC execute.

alter table public.product_dedup_audit enable row level security;

alter view public.public_leader_profiles set (security_invoker = true);

revoke execute on function public.add_review_feedback(uuid, text) from anon;
revoke execute on function public.can_use_app() from anon;
revoke execute on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) from anon;
revoke execute on function public.current_user_role() from anon;
revoke execute on function public.handle_allowed_user_saved() from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.is_active_leader() from anon;
revoke execute on function public.is_active_self() from anon;
revoke execute on function public.is_leader() from anon;
revoke execute on function public.mark_password_changed() from anon;
revoke execute on function public.profile_has_role(uuid, public.app_role) from anon;
revoke execute on function public.profile_is_active(uuid) from anon;
revoke execute on function public.reject_review_request(uuid, text) from anon;
revoke execute on function public.replace_duty_assignments(uuid, uuid[]) from anon;
revoke execute on function public.replace_product_assignments(uuid, uuid[]) from anon;
revoke execute on function public.replace_project_assignments(uuid, uuid[]) from anon;
revoke execute on function public.require_profile_role(uuid, public.app_role, text) from anon;
revoke execute on function public.update_review_request_status(uuid, public.review_status) from anon;
revoke execute on function public.validate_allowed_user_creator() from anon;
revoke execute on function public.validate_assignment_user_active() from anon;
revoke execute on function public.validate_profile_note_roles() from anon;
revoke execute on function public.validate_project_assignment_member() from anon;
revoke execute on function public.validate_project_creator_leader() from anon;
revoke execute on function public.validate_review_attachment_url() from anon;
revoke execute on function public.validate_review_feedback_leader() from anon;
