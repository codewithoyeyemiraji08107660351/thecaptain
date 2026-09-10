
-- Daily spin state per user
CREATE TABLE public.daily_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  last_spin_at timestamptz,
  has_reroll boolean NOT NULL DEFAULT false,
  boosted_odds_until timestamptz,
  chemlight_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per user
CREATE UNIQUE INDEX daily_spins_user_id_idx ON public.daily_spins(user_id);

-- Enable RLS
ALTER TABLE public.daily_spins ENABLE ROW LEVEL SECURITY;

-- Users can read their own spin state
CREATE POLICY "Users can read own spin" ON public.daily_spins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own spin state
CREATE POLICY "Users can insert own spin" ON public.daily_spins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own spin state
CREATE POLICY "Users can update own spin" ON public.daily_spins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
