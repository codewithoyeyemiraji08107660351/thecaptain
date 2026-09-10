
-- Squad themes
ALTER TABLE public.squads ADD COLUMN theme text NOT NULL DEFAULT 'default';

-- Lifetime stats table
CREATE TABLE public.user_lifetime_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  commands_received integer NOT NULL DEFAULT 0,
  commands_completed integer NOT NULL DEFAULT 0,
  commands_failed integer NOT NULL DEFAULT 0,
  commands_issued integer NOT NULL DEFAULT 0,
  highest_rank_commands integer NOT NULL DEFAULT 0,
  total_promotions integer NOT NULL DEFAULT 0,
  total_demotions integer NOT NULL DEFAULT 0,
  total_squads_joined integer NOT NULL DEFAULT 0,
  total_captain_titles integer NOT NULL DEFAULT 0,
  total_strikes integer NOT NULL DEFAULT 0,
  total_punishments_completed integer NOT NULL DEFAULT 0,
  total_punishments_failed integer NOT NULL DEFAULT 0,
  total_warnings integer NOT NULL DEFAULT 0,
  total_action_credits_used integer NOT NULL DEFAULT 0,
  total_super_credits_used integer NOT NULL DEFAULT 0,
  shield_uses integer NOT NULL DEFAULT 0,
  friendly_fire_uses integer NOT NULL DEFAULT 0,
  power_trip_uses integer NOT NULL DEFAULT 0,
  stray_bullet_uses integer NOT NULL DEFAULT 0,
  coup_uses integer NOT NULL DEFAULT 0,
  rank_lottery_uses integer NOT NULL DEFAULT 0,
  saboteur_uses integer NOT NULL DEFAULT 0,
  successful_coups integer NOT NULL DEFAULT 0,
  total_spins integer NOT NULL DEFAULT 0,
  best_spin_reward text,
  spin_action_credits_earned integer NOT NULL DEFAULT 0,
  spin_super_credits_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_lifetime_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own stats" ON public.user_lifetime_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats" ON public.user_lifetime_stats
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON public.user_lifetime_stats
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Gift credits RPC (atomic transfer)
CREATE OR REPLACE FUNCTION public.gift_action_credits(_recipient_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_id uuid := auth.uid();
  _sender_credits integer;
BEGIN
  IF _sender_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _sender_id = _recipient_id THEN RAISE EXCEPTION 'Cannot gift to yourself'; END IF;
  IF _amount < 1 OR _amount > 5 THEN RAISE EXCEPTION 'Amount must be between 1 and 5'; END IF;

  SELECT action_credits INTO _sender_credits FROM public.profiles WHERE id = _sender_id FOR UPDATE;
  IF _sender_credits < _amount THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  UPDATE public.profiles SET action_credits = action_credits - _amount WHERE id = _sender_id;
  UPDATE public.profiles SET action_credits = action_credits + _amount WHERE id = _recipient_id;
END;
$$;
