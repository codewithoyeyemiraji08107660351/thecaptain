import { supabase } from "@/integrations/supabase/client";

export interface NotificationSettings {
  receivedCommands: boolean;
  newCommands: boolean;
  failedCommands: boolean;
  newMessages: boolean;
  mentions: boolean;
  newMembers: boolean;
  polls: boolean;
  creditGifting: boolean;
  warnings: boolean;
  actionCreditsAgainstYou: boolean;
  superActionsAgainstYou: boolean;
  dailySpinReminder: boolean;
}

export const NOTIFICATION_LABELS: Record<keyof NotificationSettings, { label: string; description: string }> = {
  receivedCommands: { label: "Received Commands", description: "When The Captain issues a command specifically to you" },
  newCommands: { label: "New Commands", description: "Whenever any new command is issued in your squad" },
  failedCommands: { label: "Failed Commands", description: "When your command is marked as failed" },
  newMessages: { label: "New Messages", description: "When a new message is posted in your squad feed" },
  mentions: { label: "@ Mentions", description: "When someone @mentions your username" },
  newMembers: { label: "New Members", description: "When someone new joins your squad" },
  polls: { label: "New Poll / Poll Results", description: "When a punishment poll starts or when results are in" },
  creditGifting: { label: "Credit Gifting", description: "When a squad member gifts you Action Credits" },
  warnings: { label: "Warnings", description: "When you've received a warning, you get notified" },
  actionCreditsAgainstYou: { label: "Action Credits Used Against You", description: "When another player uses Shield, Friendly Fire, Power Trip, or Stray Bullet on you" },
  superActionsAgainstYou: { label: "Super Actions Used Against You", description: "When Coup D'état, Saboteur, or Rank Lottery is used against you" },
  dailySpinReminder: { label: "Daily Spin Reminder", description: "Get reminded at 12 PM your local time if you haven't used your daily spin yet" },
};

export const getDefaultNotificationSettings = (): NotificationSettings => ({
  receivedCommands: true,
  newCommands: true,
  failedCommands: true,
  newMessages: true,
  mentions: true,
  newMembers: true,
  polls: true,
  creditGifting: true,
  warnings: true,
  actionCreditsAgainstYou: true,
  superActionsAgainstYou: true,
  dailySpinReminder: true,
});

// Legacy key migration
const migrate = (raw: Record<string, unknown>): Partial<NotificationSettings> => {
  const out: Partial<NotificationSettings> = {};
  const keys: (keyof NotificationSettings)[] = [
    "receivedCommands","newCommands","failedCommands","newMessages","mentions",
    "newMembers","polls","creditGifting","warnings","actionCreditsAgainstYou","superActionsAgainstYou","dailySpinReminder"
  ];
  for (const k of keys) {
    if (typeof raw[k] === "boolean") out[k] = raw[k] as boolean;
  }
  if (out.superActionsAgainstYou === undefined && typeof raw.superActions === "boolean") {
    out.superActionsAgainstYou = raw.superActions as boolean;
  }
  return out;
};

export const getNotificationSettings = (): NotificationSettings => {
  try {
    const stored = localStorage.getItem("notificationSettings");
    if (!stored) return getDefaultNotificationSettings();
    return { ...getDefaultNotificationSettings(), ...migrate(JSON.parse(stored)) };
  } catch { return getDefaultNotificationSettings(); }
};

export const saveNotificationSettings = (s: NotificationSettings) => {
  localStorage.setItem("notificationSettings", JSON.stringify(s));
};

export const getAllAlertsMaster = (): boolean => {
  const v = localStorage.getItem("allAlertsMaster");
  return v === null ? true : v === "true";
};

export const setAllAlertsMaster = (on: boolean) => {
  localStorage.setItem("allAlertsMaster", String(on));
};

/** Returns true only if the master toggle AND the individual key are both enabled */
export const isNotificationEnabled = (key: keyof NotificationSettings): boolean => {
  if (!getAllAlertsMaster()) return false;
  return getNotificationSettings()[key];
};


export const syncNotificationSettingsToSupabase = async (userId: string): Promise<void> => {
  if (!userId) return;
  
  try {
    const settings = getNotificationSettings();
    const entries = Object.entries(settings) as [keyof NotificationSettings, boolean][];
    

    const data = entries.map(([key, enabled]) => ({
      user_id: userId,
      notification_type: key,
      enabled: enabled,
      updated_at: new Date().toISOString()
    }));
    
  
    const { error } = await (supabase as any)
      .from('notification_settings')
      .upsert(data, {
        onConflict: 'user_id,notification_type'
      });
    
    if (error) {
      console.error('Failed to sync notification settings to Supabase:', error);
      throw error;
    }
    
    console.log('✅ Notification settings synced to Supabase');
  } catch (error) {
    console.error('Error syncing notification settings:', error);
  }
};

/**
 * Ensure user has notification settings in Supabase
 * If not, sync local settings to database
 */
export const ensureUserNotificationSettings = async (userId: string): Promise<void> => {
  if (!userId) return;
  
  try {
    const { count, error } = await (supabase as any)
      .from('notification_settings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error checking notification settings:', error);
      return;
    }
    
    if (count === 0) {
      console.log('📱 No notification settings found in Supabase, syncing...');
      await syncNotificationSettingsToSupabase(userId);
    } else {
      console.log('✅ Notification settings already exist in Supabase');
    }
  } catch (error) {
    console.error('Error ensuring notification settings:', error);
  }
};

/**
 * Get notification settings from Supabase (for server-side filtering)
 * This is used by the Edge Function via RPC
 */
export const getNotificationSettingsFromSupabase = async (userId: string): Promise<NotificationSettings | null> => {
  if (!userId) return null;
  
  try {
    const { data, error } = await (supabase as any)
      .from('notification_settings')
      .select('notification_type, enabled')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching notification settings from Supabase:', error);
      return null;
    }
    
    if (!data || data.length === 0) return null;
    
    const settings = getDefaultNotificationSettings();
    data.forEach((item: { notification_type: keyof NotificationSettings; enabled: boolean }) => {
      if (item.notification_type in settings) {
        settings[item.notification_type] = item.enabled;
      }
    });
    
    return settings;
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return null;
  }
};