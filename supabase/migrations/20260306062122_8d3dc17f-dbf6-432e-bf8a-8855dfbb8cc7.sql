-- Allow anonymous users to read profiles (needed for username availability check during signup)
CREATE POLICY "Anon can read profiles"
ON public.profiles
FOR SELECT
TO anon
USING (true);