
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS captain_fail_limit integer NOT NULL DEFAULT 2;
ALTER TABLE public.squads ALTER COLUMN punishment_duration_hours SET DEFAULT 12;
