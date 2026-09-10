
-- Add invite link expiry column
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS invite_link_expires_at timestamptz;

-- Create a security definer function to transfer admin when leaving
CREATE OR REPLACE FUNCTION public.transfer_squad_admin(_squad_id uuid, _new_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_admin uuid;
BEGIN
  SELECT admin_id INTO _current_admin FROM public.squads WHERE id = _squad_id;
  IF _current_admin = auth.uid() THEN
    UPDATE public.squads SET admin_id = _new_admin_id WHERE id = _squad_id;
  END IF;
END;
$$;

-- Create function to regenerate invite code with expiry
CREATE OR REPLACE FUNCTION public.regenerate_invite_link(_squad_id uuid)
RETURNS TABLE(invite_code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_code text;
  _expires timestamptz;
BEGIN
  _new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  _expires := now() + interval '10 minutes';
  UPDATE public.squads SET invite_code = _new_code, invite_link_expires_at = _expires WHERE id = _squad_id;
  RETURN QUERY SELECT _new_code, _expires;
END;
$$;

-- Update lookup to check expiry
CREATE OR REPLACE FUNCTION public.lookup_squad_by_invite_code(_invite_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id, s.name FROM public.squads s 
  WHERE s.invite_code = _invite_code 
  AND (s.invite_link_expires_at IS NULL OR s.invite_link_expires_at > now())
  LIMIT 1;
$$;
