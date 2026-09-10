
-- Drop the recursive policies
DROP POLICY IF EXISTS "Members can read own squads" ON public.squads;
DROP POLICY IF EXISTS "Members can read squad members" ON public.squad_members;

-- Create security definer function to get user's squad IDs without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_squad_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_squad_ids FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_squad_ids TO authenticated;

-- Recreate squads SELECT policy using the function
CREATE POLICY "Members can read own squads"
  ON public.squads FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_my_squad_ids()));

-- Recreate squad_members SELECT policy: user can see their own rows + all members of squads they belong to
CREATE POLICY "Members can read squad members"
  ON public.squad_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR squad_id IN (SELECT public.get_my_squad_ids()));
