
CREATE OR REPLACE FUNCTION public.record_mission_failure(_squad_id uuid, _target_user_id uuid)
 RETURNS TABLE(strikes integer, consecutive_fails integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _is_member boolean := false;
  _target_in_squad boolean := false;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow any squad member to record (client-side guards who sees the buttons)
  SELECT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _actor_id
  ) OR EXISTS (
    SELECT 1
    FROM public.squads s
    WHERE s.id = _squad_id
      AND s.admin_id = _actor_id
  ) INTO _is_member;

  IF NOT _is_member THEN
    RAISE EXCEPTION 'Not allowed to record mission result';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _target_user_id
  ) INTO _target_in_squad;

  IF NOT _target_in_squad THEN
    RAISE EXCEPTION 'Target user is not in this squad';
  END IF;

  RETURN QUERY
  UPDATE public.profiles p
  SET
    strikes = p.strikes + 1,
    consecutive_fails = p.consecutive_fails + 1
  WHERE p.id = _target_user_id
  RETURNING p.strikes, p.consecutive_fails;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_mission_success(_squad_id uuid, _target_user_id uuid)
 RETURNS TABLE(completed_commands integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _is_member boolean := false;
  _target_in_squad boolean := false;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _actor_id
  ) OR EXISTS (
    SELECT 1
    FROM public.squads s
    WHERE s.id = _squad_id
      AND s.admin_id = _actor_id
  ) INTO _is_member;

  IF NOT _is_member THEN
    RAISE EXCEPTION 'Not allowed to record mission result';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _target_user_id
  ) INTO _target_in_squad;

  IF NOT _target_in_squad THEN
    RAISE EXCEPTION 'Target user is not in this squad';
  END IF;

  RETURN QUERY
  UPDATE public.profiles p
  SET
    completed_commands = p.completed_commands + 1,
    consecutive_fails = 0
  WHERE p.id = _target_user_id
  RETURNING p.completed_commands;
END;
$function$;
