// src/hooks/useDailySpinReminder.ts
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canSpinToday } from "@/lib/streak";
import { isNotificationEnabled } from "@/lib/notifications";
import { notificationTriggers } from "@/services/notificationTriggers";
import { toast } from "sonner";

const REMINDER_HOUR = 12; // 12 PM local time
const LAST_REMINDER_KEY = "lastDailySpinReminder";
const REMINDER_COOLDOWN_HOURS = 12; // Only send once per 12 hours
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const msUntilNoonLocal = (): number => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(REMINDER_HOUR, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
};

/**
 * ✅ Get the last reminder timestamp with cooldown check
 */
const getLastReminderTimestamp = (userId: string): number => {
  try {
    const key = `${LAST_REMINDER_KEY}_${userId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return 0;
    const parsed = JSON.parse(stored);
    return parsed?.timestamp || 0;
  } catch {
    return 0;
  }
};

/**
 * ✅ Set the last reminder timestamp
 */
const setLastReminderTimestamp = (userId: string, date: string): void => {
  try {
    const key = `${LAST_REMINDER_KEY}_${userId}`;
    localStorage.setItem(key, JSON.stringify({
      date: date,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to set last reminder timestamp:', error);
  }
};

/**
 * ✅ Check if a reminder can be sent (cooldown check)
 */
const canSendReminder = (userId: string, today: string): boolean => {
  const lastTimestamp = getLastReminderTimestamp(userId);
  const hoursSinceLastReminder = (Date.now() - lastTimestamp) / (1000 * 60 * 60);
  
  // ✅ Check if we've already sent today
  try {
    const key = `${LAST_REMINDER_KEY}_${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.date === today) {
        return false; // Already sent today
      }
    }
  } catch {
    // Ignore parse errors
  }
  
  // ✅ Check cooldown period
  if (hoursSinceLastReminder < REMINDER_COOLDOWN_HOURS) {
    return false;
  }
  
  return true;
};

/**
 * ✅ Retry with exponential backoff
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  delayMs: number = RETRY_DELAY_MS
): Promise<T | null> => {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, error);
      
      if (attempt < maxAttempts) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  console.error('All retry attempts failed:', lastError);
  return null;
};

/**
 * At 12:00 local time each day, push a notification reminding the user
 * to use their Daily Spin — unless they've already spun OR used the
 * bonus ad spin today, OR the toggle is off.
 */
export function useDailySpinReminder(userId: string | null | undefined) {
  const timeoutIdRef = useRef<number | undefined>();
  const intervalIdRef = useRef<number | undefined>();
  const cancelledRef = useRef(false);
  const isSendingRef = useRef(false);
  const lastCheckRef = useRef<string>('');
  
  // ✅ Cleanup function
  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (timeoutIdRef.current) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = undefined;
    }
    if (intervalIdRef.current) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = undefined;
    }
  }, []);

  // ✅ Check and send reminder
  const checkAndSendReminder = useCallback(async () => {
    // ✅ Prevent duplicate checks
    if (isSendingRef.current) {
      console.log('⏳ Reminder already sending, skipping...');
      return;
    }
    
    // ✅ Check if cancelled
    if (cancelledRef.current) {
      return;
    }
    
    // ✅ Check if user exists
    if (!userId) {
      console.log('⚠️ No user ID, skipping daily spin reminder');
      return;
    }
    
    // ✅ Check if notifications are enabled
    if (!isNotificationEnabled('dailySpinReminder')) {
      console.log('ℹ️ Daily spin reminder notifications are disabled, skipping');
      return;
    }
    
    const today = todayKey();
    
    // ✅ Check if we already sent a reminder today
    if (!canSendReminder(userId, today)) {
      console.log('ℹ️ Daily spin reminder already sent or in cooldown');
      return;
    }
    
    // ✅ Check if it's past noon
    const now = new Date();
    if (now.getHours() < REMINDER_HOUR) {
      console.log('ℹ️ Before noon, waiting for reminder time');
      return;
    }
    
    // ✅ Check if we already checked today (prevent duplicate checks)
    if (lastCheckRef.current === today) {
      console.log('ℹ️ Already checked for today');
      return;
    }
    lastCheckRef.current = today;
    
    isSendingRef.current = true;
    
    try {
      // ✅ Check spin availability with retry
      const result = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from("daily_spins")
          .select("last_spin_at, has_reroll")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        return { data, error };
      });
      
      // ✅ If retry failed, return
      if (!result) {
        console.error('❌ Failed to check spin availability after retries');
        return;
      }
      
      const { data } = result;
      
      // ✅ Check if standard daily spin is available
      const standardAvailable = !data || canSpinToday(data.last_spin_at) || data.has_reroll;
      
      // ✅ Check bonus ad spin availability
      const lastAdSpin = localStorage.getItem(`ad_spin_${userId}`);
      const bonusAvailable = !lastAdSpin || canSpinToday(lastAdSpin);
      
      // ✅ If neither is available, don't notify
      if (!standardAvailable && !bonusAvailable) {
        console.log('ℹ️ No spins available today, skipping reminder');
        // ✅ Reset last check to allow future checks
        lastCheckRef.current = '';
        return;
      }
      
      // ✅ Mark reminder as sent
      setLastReminderTimestamp(userId, today);
      
      // ✅ Show toast notification
      toast("🎰 Your Daily Spin is ready!", {
        description: "Head to the wheel before midnight to claim your reward.",
        duration: 6000,
      });
      
      // ✅ Send push notification
      try {
        const result = await notificationTriggers.triggerDailySpinReminder(userId);
        if (result) {
          console.log('✅ Daily spin reminder notification sent');
        } else {
          console.log('ℹ️ Daily spin reminder notification skipped or failed');
        }
      } catch (notificationError) {
        console.error('❌ Failed to send daily spin reminder notification:', notificationError);
        // Don't re-throw - toast already shown
      }
      
    } catch (error) {
      console.error('❌ Error in daily spin reminder:', error);
      // ✅ Reset last check on error to allow retry
      lastCheckRef.current = '';
    } finally {
      isSendingRef.current = false;
    }
  }, [userId]);

  // ✅ Main effect
  useEffect(() => {
    if (!userId) {
      cleanup();
      return;
    }

    cancelledRef.current = false;
    
    // ✅ Initial check with delay to ensure app is ready
    const initialCheck = async () => {
      // Wait a moment for app to fully load and auth to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      await checkAndSendReminder();
    };
    initialCheck();

    // ✅ Schedule next check at noon
    const scheduleNextCheck = () => {
      if (cancelledRef.current) return;
      
      const delay = msUntilNoonLocal();
      console.log(`📅 Next daily spin reminder check in ${Math.round(delay / 60000)} minutes`);
      
      timeoutIdRef.current = window.setTimeout(() => {
        // ✅ Check at noon
        checkAndSendReminder();
        
        // ✅ Then check every hour until midnight
        if (!cancelledRef.current) {
          intervalIdRef.current = window.setInterval(() => {
            checkAndSendReminder();
          }, 60 * 60 * 1000);
        }
      }, delay);
    };
    
    scheduleNextCheck();

    // ✅ Cleanup
    return cleanup;
  }, [userId, checkAndSendReminder, cleanup]);

  // ✅ Manual refresh function for debugging
  const refreshReminder = useCallback(() => {
    if (!userId) {
      console.warn('⚠️ No user ID, cannot refresh reminder');
      return;
    }
    // ✅ Reset last check to force a new check
    lastCheckRef.current = '';
    checkAndSendReminder();
  }, [userId, checkAndSendReminder]);

  // ✅ Function to reset the reminder state (for testing)
  const resetReminderState = useCallback(() => {
    if (!userId) return;
    const key = `${LAST_REMINDER_KEY}_${userId}`;
    localStorage.removeItem(key);
    lastCheckRef.current = '';
    console.log('🔄 Daily spin reminder state reset');
  }, [userId]);

  return {
    refreshReminder,
    resetReminderState,
    isSending: isSendingRef.current,
  };
}