
CREATE OR REPLACE FUNCTION public.reset_squad_profiles(_squad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _is_admin boolean := false;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only squad admin can reset
  SELECT EXISTS (
    SELECT 1 FROM public.squads s
    WHERE s.id = _squad_id AND s.admin_id = _actor_id
  ) INTO _is_admin;

  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only squad admin can reset profiles';
  END IF;

  -- Reset all members' stats
  UPDATE public.profiles p
  SET
    completed_commands = 0,
    strikes = 0,
    warnings = 0,
    consecutive_fails = 0
  WHERE p.id IN (
    SELECT sm.user_id FROM public.squad_members sm WHERE sm.squad_id = _squad_id
  );
END;
$$;
