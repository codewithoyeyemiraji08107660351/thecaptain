
-- 1. Lock down user_lifetime_stats: remove client write access
DROP POLICY IF EXISTS "Users can insert own stats" ON public.user_lifetime_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON public.user_lifetime_stats;

-- Add service role write policies
CREATE POLICY "Service role can manage stats"
ON public.user_lifetime_stats FOR ALL TO public
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- 2. Create SECURITY DEFINER RPCs for stat tracking

-- Ensure stats row exists
CREATE OR REPLACE FUNCTION public.ensure_lifetime_stats_row(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_lifetime_stats (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Increment a stat column by amount
CREATE OR REPLACE FUNCTION public.track_lifetime_stat(_stat text, _amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed text[] := ARRAY[
    'commands_received','commands_completed','commands_failed',
    'commands_issued','total_promotions','total_demotions',
    'total_squads_joined','total_captain_titles',
    'total_strikes','total_punishments_completed','total_punishments_failed',
    'total_warnings','total_action_credits_used','total_super_credits_used',
    'shield_uses','friendly_fire_uses','power_trip_uses',
    'stray_bullet_uses','coup_uses','rank_lottery_uses',
    'saboteur_uses','successful_coups','total_spins',
    'spin_action_credits_earned','spin_super_credits_earned'
  ];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_stat = ANY(_allowed)) THEN RAISE EXCEPTION 'Invalid stat name'; END IF;
  
  INSERT INTO public.user_lifetime_stats (user_id)
  VALUES (_uid)
  ON CONFLICT (user_id) DO NOTHING;
  
  EXECUTE format(
    'UPDATE public.user_lifetime_stats SET %I = %I + $1 WHERE user_id = $2',
    _stat, _stat
  ) USING _amount, _uid;
END;
$$;

-- Track highest rank
CREATE OR REPLACE FUNCTION public.track_highest_rank(_commands integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  INSERT INTO public.user_lifetime_stats (user_id, highest_rank_commands)
  VALUES (_uid, _commands)
  ON CONFLICT (user_id) DO UPDATE
  SET highest_rank_commands = GREATEST(user_lifetime_stats.highest_rank_commands, EXCLUDED.highest_rank_commands);
END;
$$;

-- Track best spin reward
CREATE OR REPLACE FUNCTION public.track_best_spin_reward(_reward text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  INSERT INTO public.user_lifetime_stats (user_id, best_spin_reward)
  VALUES (_uid, _reward)
  ON CONFLICT (user_id) DO UPDATE
  SET best_spin_reward = COALESCE(user_lifetime_stats.best_spin_reward, EXCLUDED.best_spin_reward);
END;
$$;

-- 3. Secure invite code access: create RPC for admins/vice-admins only
CREATE OR REPLACE FUNCTION public.get_squad_invite_code(_squad_id uuid)
RETURNS TABLE(invite_code text, invite_link_expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  -- Only admin or vice_admin can see invite code
  IF NOT EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND admin_id = _uid
  ) AND NOT public.has_role(_uid, _squad_id, 'vice_admin') THEN
    RAISE EXCEPTION 'Only admins and vice-admins can view invite codes';
  END IF;
  
  RETURN QUERY
  SELECT s.invite_code, s.invite_link_expires_at
  FROM public.squads s WHERE s.id = _squad_id;
END;
$$;
