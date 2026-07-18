-- Append-only follow-up for 20260718073243_finalize_review_workflow_hardening.sql.
--
-- The Stage B overload cleanup did not include this differently named legacy
-- SECURITY DEFINER RPC. Drop only the exact obsolete signature with RESTRICT,
-- so an unexpected dependency fails instead of cascading.
-- Extension objects and ACLs, including citext, are intentionally untouched.

drop function if exists public.update_review_request_status(uuid, public.review_status) restrict;

notify pgrst, 'reload schema';
