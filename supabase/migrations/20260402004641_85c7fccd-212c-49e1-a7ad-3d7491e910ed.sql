ALTER TABLE public.daily_spins
ADD CONSTRAINT daily_spins_user_id_key UNIQUE (user_id);

CREATE TABLE public.user_squad_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sort_mode text NOT NULL DEFAULT 'date_joined',
  sort_desc boolean NOT NULL DEFAULT true,
  custom_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_squad_preferences_user_id_key UNIQUE (user_id),
  CONSTRAINT user_squad_preferences_sort_mode_check CHECK (sort_mode IN ('date_joined', 'alphabetical', 'most_active', 'pending_actions', 'custom')),
  CONSTRAINT user_squad_preferences_custom_order_is_array CHECK (jsonb_typeof(custom_order) = 'array')
);

ALTER TABLE public.user_squad_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own squad preferences"
ON public.user_squad_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own squad preferences"
ON public.user_squad_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own squad preferences"
ON public.user_squad_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_squad_preferences_updated_at
BEFORE UPDATE ON public.user_squad_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();