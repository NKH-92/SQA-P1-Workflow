-- Follow-up hardening for the hosted project's legacy auto-expose behaviour.
--
-- The production database predates Supabase's always-revoked default, so a newly
-- created function is auto-granted EXECUTE to anon/authenticated/service_role on
-- creation. Migration 202607110001 revoked the add-only assignment RPCs from
-- PUBLIC only, so anon kept its auto-granted EXECUTE and the DB Migrate
-- verification gate (not has_function_privilege('anon', ...)) failed even though
-- the function bodies already reject non-leaders via is_active_leader().
--
-- Strip the leftover anon grants so the privilege surface matches the intended
-- authenticated-only design. Every REVOKE below is a no-op where the grant is
-- already absent (fresh databases created under the new default), so this
-- migration is safe and idempotent on any environment.

revoke all on function public.add_product_assignment(uuid, uuid) from anon;
revoke all on function public.add_duty_assignment(uuid, uuid) from anon;

-- Defensive parity: assert the same authenticated-only surface for the rest of
-- the assignment/review RPCs and the gated leader view, in case any of them was
-- auto-exposed to anon on the hosted project as well.
revoke all on function public.replace_project_assignments_if_current(uuid, uuid[], timestamptz) from anon;
revoke all on function public.reopen_review_request(uuid) from anon;
revoke all on function public.update_review_request_status(uuid, public.review_status) from anon;
revoke all on function public.reject_review_request(uuid, text) from anon;
revoke all on function public.add_review_feedback(uuid, text) from anon;
revoke all on public.public_leader_profiles from anon;

-- Re-assert the intended authenticated grants (idempotent).
grant execute on function public.add_product_assignment(uuid, uuid) to authenticated;
grant execute on function public.add_duty_assignment(uuid, uuid) to authenticated;
