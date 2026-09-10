DROP POLICY IF EXISTS "Captains and admin can create squad live state" ON public.squad_live_state;
DROP POLICY IF EXISTS "Captains and admin can update squad live state" ON public.squad_live_state;

CREATE POLICY "Members can create squad live state"
ON public.squad_live_state
FOR INSERT
TO authenticated
WITH CHECK (
  (squad_id IN (SELECT public.get_my_squad_ids()))
  OR (squad_id IN (SELECT s.id FROM public.squads s WHERE s.admin_id = auth.uid()))
);

CREATE POLICY "Members can update squad live state"
ON public.squad_live_state
FOR UPDATE
TO authenticated
USING (
  (squad_id IN (SELECT public.get_my_squad_ids()))
  OR (squad_id IN (SELECT s.id FROM public.squads s WHERE s.admin_id = auth.uid()))
)
WITH CHECK (
  (squad_id IN (SELECT public.get_my_squad_ids()))
  OR (squad_id IN (SELECT s.id FROM public.squads s WHERE s.admin_id = auth.uid()))
);