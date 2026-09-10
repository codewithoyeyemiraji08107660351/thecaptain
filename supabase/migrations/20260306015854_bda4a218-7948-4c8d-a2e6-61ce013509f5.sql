
-- Create a security definer function to look up squad by invite code
-- This bypasses RLS so any authenticated user can find a squad by its invite code
CREATE OR REPLACE FUNCTION public.lookup_squad_by_invite_code(_invite_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.squads WHERE invite_code = _invite_code LIMIT 1;
$$;
