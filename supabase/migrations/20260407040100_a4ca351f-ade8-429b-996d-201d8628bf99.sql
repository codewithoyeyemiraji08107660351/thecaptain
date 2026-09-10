DROP POLICY IF EXISTS "Members can read squad chemlights" ON public.daily_spins;

CREATE POLICY "Members can read squad chemlights"
ON public.daily_spins
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.squad_members viewer
    JOIN public.squad_members owner_membership
      ON owner_membership.squad_id = viewer.squad_id
    WHERE viewer.user_id = auth.uid()
      AND owner_membership.user_id = daily_spins.user_id
  )
);