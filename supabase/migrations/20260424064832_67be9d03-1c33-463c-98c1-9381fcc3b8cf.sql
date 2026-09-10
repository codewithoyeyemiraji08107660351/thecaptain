-- ============================================================================
-- 1) Lock down realtime.messages so users can only subscribe to their own
--    private channels and channels for squads they belong to.
-- ============================================================================

-- Helper: extract the squad UUID from topics like 'squad-sync:<uuid>' or 'squad:<uuid>'
CREATE OR REPLACE FUNCTION public.realtime_topic_squad_id(_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _suffix text;
BEGIN
  IF _topic IS NULL THEN RETURN NULL; END IF;
  IF _topic LIKE 'squad-sync:%' THEN
    _suffix := substr(_topic, length('squad-sync:') + 1);
  ELSIF _topic LIKE 'squad:%' THEN
    _suffix := substr(_topic, length('squad:') + 1);
  ELSE
    RETURN NULL;
  END IF;
  -- Validate UUID format defensively
  BEGIN
    RETURN _suffix::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- Helper: extract the user UUID from topics like 'user:<uuid>' or 'profile-live:<uuid>'
CREATE OR REPLACE FUNCTION public.realtime_topic_user_id(_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _suffix text;
BEGIN
  IF _topic IS NULL THEN RETURN NULL; END IF;
  IF _topic LIKE 'user:%' THEN
    _suffix := substr(_topic, length('user:') + 1);
  ELSIF _topic LIKE 'profile-live:%' THEN
    _suffix := substr(_topic, length('profile-live:') + 1);
  ELSE
    RETURN NULL;
  END IF;
  BEGIN
    RETURN _suffix::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- Drop any pre-existing custom policies we might have added before
DROP POLICY IF EXISTS "Authorized topic subscriptions" ON realtime.messages;
DROP POLICY IF EXISTS "Authorized topic broadcasts" ON realtime.messages;

-- SELECT (subscription) — only allow if the topic resolves to:
--   * the caller's own user/profile channel, OR
--   * a squad the caller belongs to (member or admin)
CREATE POLICY "Authorized topic subscriptions"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    public.realtime_topic_user_id((SELECT realtime.topic())) = auth.uid()
  )
  OR
  (
    public.realtime_topic_squad_id((SELECT realtime.topic())) IS NOT NULL
    AND (
      public.realtime_topic_squad_id((SELECT realtime.topic())) IN (SELECT public.get_my_squad_ids())
      OR EXISTS (
        SELECT 1 FROM public.squads s
        WHERE s.id = public.realtime_topic_squad_id((SELECT realtime.topic()))
          AND s.admin_id = auth.uid()
      )
    )
  )
);

-- INSERT (broadcast) — same restriction so users can't push messages to
-- channels they shouldn't even subscribe to.
CREATE POLICY "Authorized topic broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.realtime_topic_user_id((SELECT realtime.topic())) = auth.uid()
  )
  OR
  (
    public.realtime_topic_squad_id((SELECT realtime.topic())) IS NOT NULL
    AND (
      public.realtime_topic_squad_id((SELECT realtime.topic())) IN (SELECT public.get_my_squad_ids())
      OR EXISTS (
        SELECT 1 FROM public.squads s
        WHERE s.id = public.realtime_topic_squad_id((SELECT realtime.topic()))
          AND s.admin_id = auth.uid()
      )
    )
  )
);

-- ============================================================================
-- 2) Restrict squad_live_state writes to admin + active captains only.
--    (Reads remain available to all squad members.)
-- ============================================================================

DROP POLICY IF EXISTS "Members can create squad live state" ON public.squad_live_state;
DROP POLICY IF EXISTS "Members can update squad live state" ON public.squad_live_state;

CREATE POLICY "Captains and admin can create squad live state"
ON public.squad_live_state
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.squads s
    WHERE s.id = squad_live_state.squad_id
      AND s.admin_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.squad_members sm
    WHERE sm.squad_id = squad_live_state.squad_id
      AND sm.user_id = auth.uid()
      AND sm.is_captain = true
  )
);

CREATE POLICY "Captains and admin can update squad live state"
ON public.squad_live_state
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.squads s
    WHERE s.id = squad_live_state.squad_id
      AND s.admin_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.squad_members sm
    WHERE sm.squad_id = squad_live_state.squad_id
      AND sm.user_id = auth.uid()
      AND sm.is_captain = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.squads s
    WHERE s.id = squad_live_state.squad_id
      AND s.admin_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.squad_members sm
    WHERE sm.squad_id = squad_live_state.squad_id
      AND sm.user_id = auth.uid()
      AND sm.is_captain = true
  )
);