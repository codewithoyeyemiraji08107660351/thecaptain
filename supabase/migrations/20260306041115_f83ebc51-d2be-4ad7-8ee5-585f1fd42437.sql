-- Add captain activity tracking
ALTER TABLE public.squad_members
ADD COLUMN IF NOT EXISTS last_command_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Persistent shared squad state (messages, mission reports, active commands/polls)
CREATE TABLE IF NOT EXISTS public.squad_live_state (
  squad_id UUID PRIMARY KEY REFERENCES public.squads(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.squad_live_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_squad_live_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_squad_live_state_updated_at ON public.squad_live_state;
CREATE TRIGGER trg_touch_squad_live_state_updated_at
BEFORE UPDATE ON public.squad_live_state
FOR EACH ROW
EXECUTE FUNCTION public.touch_squad_live_state_updated_at();

DROP POLICY IF EXISTS "Members can read squad live state" ON public.squad_live_state;
CREATE POLICY "Members can read squad live state"
ON public.squad_live_state
FOR SELECT
USING (
  squad_id IN (SELECT public.get_my_squad_ids())
  OR squad_id IN (SELECT id FROM public.squads WHERE admin_id = auth.uid())
);

DROP POLICY IF EXISTS "Members can create squad live state" ON public.squad_live_state;
CREATE POLICY "Members can create squad live state"
ON public.squad_live_state
FOR INSERT
WITH CHECK (
  squad_id IN (SELECT public.get_my_squad_ids())
  OR squad_id IN (SELECT id FROM public.squads WHERE admin_id = auth.uid())
);

DROP POLICY IF EXISTS "Members can update squad live state" ON public.squad_live_state;
CREATE POLICY "Members can update squad live state"
ON public.squad_live_state
FOR UPDATE
USING (
  squad_id IN (SELECT public.get_my_squad_ids())
  OR squad_id IN (SELECT id FROM public.squads WHERE admin_id = auth.uid())
)
WITH CHECK (
  squad_id IN (SELECT public.get_my_squad_ids())
  OR squad_id IN (SELECT id FROM public.squads WHERE admin_id = auth.uid())
);

-- Sync captain flags safely (admin or existing captains only)
CREATE OR REPLACE FUNCTION public.sync_squad_captains(_squad_id UUID, _captain_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_manage boolean := false;
  _safe_captain_ids UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.squads s
      WHERE s.id = _squad_id
        AND s.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.squad_members sm
      WHERE sm.squad_id = _squad_id
        AND sm.user_id = auth.uid()
        AND sm.is_captain = true
    )
  ) INTO _can_manage;

  IF NOT _can_manage THEN
    RAISE EXCEPTION 'Not allowed to update captain list';
  END IF;

  SELECT COALESCE(array_agg(sm.user_id), ARRAY[]::UUID[])
  INTO _safe_captain_ids
  FROM public.squad_members sm
  WHERE sm.squad_id = _squad_id
    AND sm.user_id = ANY(COALESCE(_captain_ids, ARRAY[]::UUID[]));

  UPDATE public.squad_members sm
  SET
    is_captain = sm.user_id = ANY(_safe_captain_ids),
    last_command_at = CASE
      WHEN sm.user_id = ANY(_safe_captain_ids) AND sm.is_captain = false THEN now()
      ELSE sm.last_command_at
    END
  WHERE sm.squad_id = _squad_id;
END;
$$;

-- Record command activity timestamp for inactivity timeout checks
CREATE OR REPLACE FUNCTION public.record_captain_command(_squad_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.squad_members
  SET last_command_at = now()
  WHERE squad_id = _squad_id
    AND user_id = auth.uid()
    AND is_captain = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only active captains can issue commands';
  END IF;
END;
$$;

-- Rotate captains after 10 days of inactivity, weighted by member rank (completed commands)
CREATE OR REPLACE FUNCTION public.rotate_inactive_captains(_squad_id UUID)
RETURNS TABLE(old_captain_id UUID, new_captain_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inactive UUID;
  _replacement UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.squads s
    WHERE s.id = _squad_id
      AND s.admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed to rotate captains for this squad';
  END IF;

  FOR _inactive IN
    SELECT sm.user_id
    FROM public.squad_members sm
    WHERE sm.squad_id = _squad_id
      AND sm.is_captain = true
      AND COALESCE(sm.last_command_at, sm.joined_at, now()) <= now() - interval '10 days'
  LOOP
    SELECT candidate.user_id
    INTO _replacement
    FROM (
      SELECT
        sm.user_id,
        random() * (GREATEST(1, p.completed_commands) + 1) AS weighted_roll
      FROM public.squad_members sm
      JOIN public.profiles p ON p.id = sm.user_id
      WHERE sm.squad_id = _squad_id
        AND sm.is_captain = false
        AND sm.user_id <> _inactive
    ) AS candidate
    ORDER BY candidate.weighted_roll DESC
    LIMIT 1;

    -- If there is no eligible replacement, keep the current captain
    IF _replacement IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.squad_members
    SET is_captain = false
    WHERE squad_id = _squad_id
      AND user_id = _inactive;

    UPDATE public.squad_members
    SET is_captain = true,
        last_command_at = now()
    WHERE squad_id = _squad_id
      AND user_id = _replacement;

    old_captain_id := _inactive;
    new_captain_id := _replacement;
    RETURN NEXT;

    _replacement := NULL;
  END LOOP;
END;
$$;

-- Ensure realtime propagation for squad synchronization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'squad_live_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_live_state;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'squad_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'squads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squads;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;