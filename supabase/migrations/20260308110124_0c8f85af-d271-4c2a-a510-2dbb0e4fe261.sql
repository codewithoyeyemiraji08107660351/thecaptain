CREATE OR REPLACE FUNCTION public.sync_squad_captains(_squad_id uuid, _captain_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_member boolean := false;
  _safe_captain_ids UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow any squad member (or admin) to sync captains
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.squads s
      WHERE s.id = _squad_id
        AND s.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.squad_members sm
      WHERE sm.squad_id = _squad_id
        AND sm.user_id = auth.uid()
    )
  ) INTO _is_member;

  IF NOT _is_member THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;

  SELECT COALESCE(array_agg(sm.user_id), ARRAY[]::UUID[])
  INTO _safe_captain_ids
  FROM public.squad_members sm
  WHERE sm.squad_id = _squad_id
    AND sm.user_id = ANY(COALESCE(_captain_ids, ARRAY[]::UUID[]));

  UPDATE public.squad_members sm
  SET
    is_captain = sm.user_id = ANY(_safe_captain_ids),
    last_command_at = CASE
      WHEN sm.user_id = ANY(_safe_captain_ids) AND sm.is_captain = false THEN now()
      ELSE sm.last_command_at
    END
  WHERE sm.squad_id = _squad_id;
END;
$function$