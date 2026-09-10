
-- Fix squad_live_state: change policies from public to authenticated
DROP POLICY IF EXISTS "Members can read squad live state" ON public.squad_live_state;
DROP POLICY IF EXISTS "Members can create squad live state" ON public.squad_live_state;
DROP POLICY IF EXISTS "Members can update squad live state" ON public.squad_live_state;

CREATE POLICY "Members can read squad live state"
ON public.squad_live_state FOR SELECT TO authenticated
USING (
  squad_id IN (SELECT get_my_squad_ids())
  OR squad_id IN (SELECT id FROM squads WHERE admin_id = auth.uid())
);

CREATE POLICY "Members can create squad live state"
ON public.squad_live_state FOR INSERT TO authenticated
WITH CHECK (
  squad_id IN (SELECT get_my_squad_ids())
  OR squad_id IN (SELECT id FROM squads WHERE admin_id = auth.uid())
);

CREATE POLICY "Members can update squad live state"
ON public.squad_live_state FOR UPDATE TO authenticated
USING (
  squad_id IN (SELECT get_my_squad_ids())
  OR squad_id IN (SELECT id FROM squads WHERE admin_id = auth.uid())
)
WITH CHECK (
  squad_id IN (SELECT get_my_squad_ids())
  OR squad_id IN (SELECT id FROM squads WHERE admin_id = auth.uid())
);

-- Fix user_roles: change SELECT from public to authenticated, scoped to own squads
DROP POLICY IF EXISTS "Members can read squad roles" ON public.user_roles;

CREATE POLICY "Members can read squad roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  squad_id IN (SELECT get_my_squad_ids())
  OR EXISTS (SELECT 1 FROM squads s WHERE s.id = user_roles.squad_id AND s.admin_id = auth.uid())
);
