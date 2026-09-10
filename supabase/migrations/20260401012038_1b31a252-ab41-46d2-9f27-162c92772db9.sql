
CREATE TABLE public.user_squad_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, squad_id)
);

ALTER TABLE public.user_squad_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own themes"
  ON public.user_squad_themes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own themes"
  ON public.user_squad_themes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own themes"
  ON public.user_squad_themes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
