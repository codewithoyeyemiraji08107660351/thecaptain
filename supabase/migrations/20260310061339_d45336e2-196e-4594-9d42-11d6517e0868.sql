
-- Server-side enforcement: prevent free users from joining more than 1 squad
CREATE OR REPLACE FUNCTION public.enforce_squad_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_premium boolean := false;
  _squad_count integer := 0;
BEGIN
  -- Check if user is premium
  SELECT COALESCE(p.is_premium, false)
  INTO _is_premium
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF _is_premium THEN
    RETURN NEW;
  END IF;

  -- Count existing squad memberships
  SELECT COUNT(*)
  INTO _squad_count
  FROM public.squad_members sm
  WHERE sm.user_id = NEW.user_id;

  IF _squad_count >= 1 THEN
    RAISE EXCEPTION 'Free users can only join 1 squad. Upgrade to premium for unlimited squads.';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to squad_members INSERT
DROP TRIGGER IF EXISTS enforce_squad_limit_trigger ON public.squad_members;
CREATE TRIGGER enforce_squad_limit_trigger
  BEFORE INSERT ON public.squad_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_squad_limit();

-- Also enforce on squad creation: prevent free users from creating more than 1 squad
-- (they also get added as a member, so the above trigger covers it)
