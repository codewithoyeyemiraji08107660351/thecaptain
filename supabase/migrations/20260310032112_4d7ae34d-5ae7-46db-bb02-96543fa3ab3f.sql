
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS action_credits_exhausted_at timestamptz,
ADD COLUMN IF NOT EXISTS super_action_credits_exhausted_at timestamptz;
