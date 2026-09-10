
-- Squads table
CREATE TABLE public.squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  admin_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invite_code text NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 8)),
  is_open boolean NOT NULL DEFAULT false,
  max_captains integer NOT NULL DEFAULT 3,
  poll_duration_hours integer NOT NULL DEFAULT 24,
  punishment_duration_hours integer NOT NULL DEFAULT 48,
  command_duration_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;

-- Squad members table
CREATE TABLE public.squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid REFERENCES public.squads(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_captain boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);

ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

-- RLS: Members can read their own squads
CREATE POLICY "Members can read own squads"
  ON public.squads FOR SELECT TO authenticated
  USING (
    id IN (SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid())
  );

-- RLS: Any authenticated user can create a squad
CREATE POLICY "Authenticated users can create squads"
  ON public.squads FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());

-- RLS: Admin can update their squad
CREATE POLICY "Admin can update own squad"
  ON public.squads FOR UPDATE TO authenticated
  USING (admin_id = auth.uid());

-- RLS: Admin can delete their squad
CREATE POLICY "Admin can delete own squad"
  ON public.squads FOR DELETE TO authenticated
  USING (admin_id = auth.uid());

-- Squad members RLS
CREATE POLICY "Members can read squad members"
  ON public.squad_members FOR SELECT TO authenticated
  USING (
    squad_id IN (SELECT squad_id FROM public.squad_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can join squads"
  ON public.squad_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin can manage members"
  ON public.squad_members FOR DELETE TO authenticated
  USING (
    squad_id IN (SELECT id FROM public.squads WHERE admin_id = auth.uid())
    OR user_id = auth.uid()
  );
