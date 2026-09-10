
-- Also allow squad admins to read their own squads (needed for INSERT...RETURNING)
DROP POLICY IF EXISTS "Members can read own squads" ON public.squads;
CREATE POLICY "Members can read own squads"
  ON public.squads FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR id IN (SELECT public.get_my_squad_ids()));
