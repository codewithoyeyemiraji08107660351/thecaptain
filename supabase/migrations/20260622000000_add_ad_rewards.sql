ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS extra_spins INTEGER DEFAULT 0;

-- Enhanced award_ad_credit function that supports both credit types
CREATE OR REPLACE FUNCTION award_ad_credit(
  _credit_type TEXT,
  _transaction_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_already_rewarded BOOLEAN;
  v_credits_awarded INTEGER := 1;
  v_max_daily_ads INTEGER := 5;
  v_daily_count INTEGER;
BEGIN

  IF _credit_type NOT IN ('action_credit', 'extra_spin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credit type');
  END IF;
  
  -- Check daily limit
  SELECT COUNT(*) INTO v_daily_count
  FROM ad_rewards 
  WHERE user_id = v_user_id 
  AND reward_date = v_today
  AND credit_type = _credit_type;
  
  IF v_daily_count >= v_max_daily_ads THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily limit reached',
      'watched_today', v_daily_count,
      'max_per_day', v_max_daily_ads
    );
  END IF;
  
  IF _transaction_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 
      FROM ad_rewards 
      WHERE transaction_id = _transaction_id
    ) INTO v_already_rewarded;
    
    IF v_already_rewarded THEN
      RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction');
    END IF;
  END IF;
  
  IF _credit_type = 'action_credit' THEN
    UPDATE profiles 
    SET action_credits = COALESCE(action_credits, 0) + v_credits_awarded,
        updated_at = NOW()
    WHERE id = v_user_id;
  ELSE -- extra_spin
    UPDATE profiles 
    SET extra_spins = COALESCE(extra_spins, 0) + v_credits_awarded,
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;
  
  -- Record the reward
  INSERT INTO ad_rewards (
    user_id, 
    reward_date, 
    credit_type, 
    credits_awarded,
    transaction_id
  )
  VALUES (
    v_user_id, 
    v_today, 
    _credit_type, 
    v_credits_awarded,
    _transaction_id
  )
  ON CONFLICT (user_id, reward_date, credit_type) DO UPDATE
  SET transaction_id = EXCLUDED.transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'credits_awarded', v_credits_awarded,
    'credit_type', _credit_type,
    'watched_today', v_daily_count + 1,
    'remaining', v_max_daily_ads - (v_daily_count + 1),
    'max_per_day', v_max_daily_ads
  );
END;
$$;

CREATE OR REPLACE FUNCTION can_watch_ad(_credit_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_daily_count INTEGER;
  v_max_daily_ads INTEGER := 5;
BEGIN
  SELECT COUNT(*) INTO v_daily_count
  FROM ad_rewards 
  WHERE user_id = v_user_id 
  AND reward_date = v_today
  AND credit_type = _credit_type;
  
  RETURN jsonb_build_object(
    'can_watch', v_daily_count < v_max_daily_ads,
    'watched_today', v_daily_count,
    'remaining', GREATEST(0, v_max_daily_ads - v_daily_count),
    'max_per_day', v_max_daily_ads
  );
END;
$$;

ALTER TABLE ad_rewards 
ADD COLUMN IF NOT EXISTS transaction_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS ad_network TEXT DEFAULT 'admob';
ALTER TABLE ad_rewards DROP CONSTRAINT IF EXISTS ad_rewards_user_id_reward_date_credit_type_key;


-- 3. Fix the INSERT to not use ON CONFLICT
CREATE OR REPLACE FUNCTION award_ad_credit(
  _credit_type TEXT,
  _transaction_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_already_rewarded BOOLEAN;
  v_credits_awarded INTEGER := 1;
  v_max_daily_ads INTEGER := 5;
  v_daily_count INTEGER;
BEGIN
  -- Add authentication check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _credit_type NOT IN ('action_credit', 'extra_spin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credit type');
  END IF;
  
  -- Check daily limit
  SELECT COUNT(*) INTO v_daily_count
  FROM ad_rewards 
  WHERE user_id = v_user_id 
  AND reward_date = v_today
  AND credit_type = _credit_type;
  
  IF v_daily_count >= v_max_daily_ads THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily limit reached',
      'watched_today', v_daily_count,
      'max_per_day', v_max_daily_ads
    );
  END IF;
  
  -- Check for duplicate transaction
  IF _transaction_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 
      FROM ad_rewards 
      WHERE transaction_id = _transaction_id
    ) INTO v_already_rewarded;
    
    IF v_already_rewarded THEN
      RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction');
    END IF;
  END IF;
  

  IF _credit_type = 'action_credit' THEN
    UPDATE profiles 
    SET action_credits = COALESCE(action_credits, 0) + v_credits_awarded,
        updated_at = NOW()
    WHERE id = v_user_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;
  ELSE -- extra_spin
    UPDATE profiles 
    SET extra_spins = COALESCE(extra_spins, 0) + v_credits_awarded,
        updated_at = NOW()
    WHERE id = v_user_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;
  END IF;
  
  -- Record the reward (simple INSERT, no ON CONFLICT)
  INSERT INTO ad_rewards (
    user_id, 
    reward_date, 
    credit_type, 
    credits_awarded,
    transaction_id,
    ad_network
  )
  VALUES (
    v_user_id, 
    v_today, 
    _credit_type, 
    v_credits_awarded,
    _transaction_id,
    'admob'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'credits_awarded', v_credits_awarded,
    'credit_type', _credit_type,
    'watched_today', v_daily_count + 1,
    'remaining', v_max_daily_ads - (v_daily_count + 1),
    'max_per_day', v_max_daily_ads
  );
END;
$$;
