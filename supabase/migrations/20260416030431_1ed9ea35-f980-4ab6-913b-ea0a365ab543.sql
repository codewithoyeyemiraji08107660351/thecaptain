
-- Drop overly permissive SELECT policies
DROP POLICY IF EXISTS "Anon can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;

-- Users can always read their own full profile
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Squad members can read profiles of people in the same squads
CREATE POLICY "Squad members can read teammate profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT sm.user_id
    FROM public.squad_members sm
    WHERE sm.squad_id IN (SELECT public.get_my_squad_ids())
  )
);

-- Admins can read profiles of members in squads they admin
CREATE POLICY "Admins can read squad member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT sm.user_id
    FROM public.squad_members sm
    JOIN public.squads s ON s.id = sm.squad_id
    WHERE s.admin_id = auth.uid()
  )
);

-- Security definer function for username availability check (no sensitive data exposed)
CREATE OR REPLACE FUNCTION public.check_username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username)
  );
$$;

-- Security definer function to look up a profile's id by username (for edge functions)
CREATE OR REPLACE FUNCTION public.get_profile_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(username) = lower(_username) LIMIT 1;
$$;
