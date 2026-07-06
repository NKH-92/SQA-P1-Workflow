-- Ensure mutation RPCs are not callable via PUBLIC/anon (authenticated only).

revoke all on function public.mark_password_changed() from public;
grant execute on function public.mark_password_changed() to authenticated;

revoke all on function public.add_review_feedback(uuid, text) from public;
grant execute on function public.add_review_feedback(uuid, text) to authenticated;

revoke all on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) from public;
grant execute on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) to authenticated;

revoke all on function public.reject_review_request(uuid, text) from public;
grant execute on function public.reject_review_request(uuid, text) to authenticated;

revoke all on function public.replace_duty_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_duty_assignments(uuid, uuid[]) to authenticated;

revoke all on function public.replace_product_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_product_assignments(uuid, uuid[]) to authenticated;

revoke all on function public.replace_project_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_project_assignments(uuid, uuid[]) to authenticated;

revoke all on function public.update_review_request_status(uuid, public.review_status) from public;
grant execute on function public.update_review_request_status(uuid, public.review_status) to authenticated;
