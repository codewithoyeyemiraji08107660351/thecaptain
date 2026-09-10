
-- Revoke blanket UPDATE and re-grant only safe columns
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT UPDATE (username, avatar, first_name, last_name, last_seen_at) ON public.profiles TO authenticated;

-- 1. Grant premium (self only)
CREATE OR REPLACE FUNCTION public.grant_premium()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET is_premium = true WHERE id = auth.uid();
END;
$$;

-- 2. Award spin credit (self only, +1)
CREATE OR REPLACE FUNCTION public.award_spin_credit(_credit_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _credit_type = 'action_credit' THEN
    UPDATE public.profiles SET action_credits = action_credits + 1 WHERE id = auth.uid();
  ELSIF _credit_type = 'super_action_credit' THEN
    UPDATE public.profiles SET super_action_credits = super_action_credits + 1 WHERE id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Invalid credit type';
  END IF;
END;
$$;

-- 3. Reset profile for squad join (self only)
CREATE OR REPLACE FUNCTION public.reset_profile_for_squad_join()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
  SET strikes = 0, consecutive_fails = 0, warnings = 0, completed_commands = 0
  WHERE id = auth.uid();
END;
$$;

-- 4. Apply punishment outcome (squad member context)
CREATE OR REPLACE FUNCTION public.apply_punishment_outcome(_target_user_id uuid, _squad_id uuid, _new_warnings int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = _target_user_id
  ) THEN
    RAISE EXCEPTION 'Target not in squad';
  END IF;
  UPDATE public.profiles
  SET warnings = _new_warnings, strikes = 0, consecutive_fails = 0
  WHERE id = _target_user_id;
END;
$$;

-- 5. Apply legendary bonus
CREATE OR REPLACE FUNCTION public.apply_legendary_bonus(_target_user_id uuid, _squad_id uuid, _completed_commands int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;
  UPDATE public.profiles
  SET completed_commands = _completed_commands, action_credits = action_credits + 1
  WHERE id = _target_user_id;
END;
$$;

-- 6. Apply demotion
CREATE OR REPLACE FUNCTION public.apply_demotion(_target_user_id uuid, _squad_id uuid, _completed_commands int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;
  UPDATE public.profiles
  SET completed_commands = GREATEST(0, _completed_commands)
  WHERE id = _target_user_id;
  PERFORM public.sync_vice_admin_roles(_squad_id);
END;
$$;

-- 7. Spend action credits (self only)
CREATE OR REPLACE FUNCTION public.spend_action_credits_v2(_amount int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current int;
  _new int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT action_credits INTO _current FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _current < _amount THEN RAISE EXCEPTION 'Insufficient action credits'; END IF;
  _new := _current - _amount;
  UPDATE public.profiles
  SET action_credits = _new,
      action_credits_exhausted_at = CASE WHEN _new = 0 THEN now() ELSE action_credits_exhausted_at END
  WHERE id = auth.uid();
END;
$$;

-- 8. Spend super action credits (self only)
CREATE OR REPLACE FUNCTION public.spend_super_action_credits_v2(_amount int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current int;
  _new int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT super_action_credits INTO _current FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _current < _amount THEN RAISE EXCEPTION 'Insufficient super action credits'; END IF;
  _new := _current - _amount;
  UPDATE public.profiles
  SET super_action_credits = _new,
      super_action_credits_exhausted_at = CASE WHEN _new = 0 THEN now() ELSE super_action_credits_exhausted_at END
  WHERE id = auth.uid();
END;
$$;

-- 9. Set member strikes (squad member context)
CREATE OR REPLACE FUNCTION public.set_member_strikes(_target_user_id uuid, _squad_id uuid, _strikes int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;
  UPDATE public.profiles SET strikes = _strikes WHERE id = _target_user_id;
END;
$$;

-- 10. Reset member profile full (for ejection/leaving)
CREATE OR REPLACE FUNCTION public.reset_member_profile_full(_target_user_id uuid, _squad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this squad';
  END IF;
  UPDATE public.profiles
  SET warnings = 0, strikes = 0, consecutive_fails = 0, completed_commands = 0
  WHERE id = _target_user_id;
END;
$$;

-- 11. Purchase credits (self only, placeholder for payment verification)
CREATE OR REPLACE FUNCTION public.purchase_credits(_action_credits int DEFAULT 0, _super_credits int DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
  SET action_credits = action_credits + GREATEST(0, _action_credits),
      super_action_credits = super_action_credits + GREATEST(0, _super_credits)
  WHERE id = auth.uid();
END;
$$;

-- 12. Award ad credit (self only, +1 action credit)
CREATE OR REPLACE FUNCTION public.award_ad_credit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET action_credits = action_credits + 1 WHERE id = auth.uid();
END;
$$;
