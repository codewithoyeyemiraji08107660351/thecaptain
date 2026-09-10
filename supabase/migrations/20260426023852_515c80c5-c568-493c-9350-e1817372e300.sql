-- Revoke direct column read access on sensitive invite columns from authenticated users.
-- The existing SECURITY DEFINER functions (get_squad_invite_code, regenerate_invite_link,
-- lookup_squad_by_invite_code) remain the only access paths.
REVOKE SELECT (invite_code, invite_link_expires_at) ON public.squads FROM authenticated;
REVOKE SELECT (invite_code, invite_link_expires_at) ON public.squads FROM anon;

-- Ensure service role retains full access (it does by default, but be explicit).
GRANT SELECT ON public.squads TO service_role;