-- Advisor-driven hardening (2026-07-07), applied as remote migration
-- `hardening_revoke_rpc_and_listing`.

-- 1. handle_new_user is a trigger-only SECURITY DEFINER function; it must not
--    be callable through the PostgREST /rpc surface.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 2. Object URLs on a public bucket don't go through RLS, so the broad SELECT
--    policy only added the ability to LIST the bucket (enumerating user and
--    story ids in paths). Drop it.
drop policy "story images public read" on storage.objects;
