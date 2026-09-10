
CREATE OR REPLACE FUNCTION public.adjust_member_rank(_squad_id uuid, _target_user_id uuid, _delta integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_commands integer := 0;
  _is_admin boolean := false;
  _is_actor_member boolean := false;
  _target_in_squad boolean := false;
  _target_is_admin boolean := false;
  _target_commands integer := 0;
  _new_commands integer := 0;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid rank delta';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.squads s
    WHERE s.id = _squad_id
      AND s.admin_id = _actor_id
  ) INTO _is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _actor_id
  ) INTO _is_actor_member;

  IF NOT _is_admin AND NOT _is_actor_member THEN
    RAISE EXCEPTION 'Not allowed to manage ranks in this squad';
  END IF;

  SELECT COALESCE(p.completed_commands, 0)
  INTO _actor_commands
  FROM public.profiles p
  WHERE p.id = _actor_id;

  -- Non-admin rank managers must be Vice Admiral+ (42 commands)
  IF NOT _is_admin AND _actor_commands < 42 THEN
    RAISE EXCEPTION 'Only Vice Admirals or Admins can manage ranks';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = _target_user_id
  ) INTO _target_in_squad;

  IF NOT _target_in_squad THEN
    RAISE EXCEPTION 'Target user is not in this squad';
  END IF;

  SELECT (s.admin_id = _target_user_id)
  INTO _target_is_admin
  FROM public.squads s
  WHERE s.id = _squad_id;

  SELECT COALESCE(p.completed_commands, 0)
  INTO _target_commands
  FROM public.profiles p
  WHERE p.id = _target_user_id
  FOR UPDATE;

  -- Admins can promote anyone; only block demotion of admins/admirals
  -- Non-admins cannot change rank of admins or admirals (49+ commands)
  IF NOT _is_admin THEN
    IF _target_is_admin OR _target_commands >= 49 THEN
      RAISE EXCEPTION 'Cannot change rank for Admin/Admiral';
    END IF;
  ELSE
    -- Admin can promote anyone but cannot demote another admin or admiral
    IF _delta = -1 AND (_target_is_admin OR _target_commands >= 49) THEN
      RAISE EXCEPTION 'Cannot demote Admin/Admiral';
    END IF;
  END IF;

  _new_commands := GREATEST(0, _target_commands + _delta);

  UPDATE public.profiles
  SET completed_commands = _new_commands
  WHERE id = _target_user_id;

  RETURN _new_commands;
END;
$function$;
