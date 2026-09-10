import { Preferences } from "@capacitor/preferences";

const INVITE_STORAGE_KEY = "pending_invite_code";

export const savePendingInvite = async (code: string): Promise<void> => {
  try {
    const normalizedCode = code.trim().toUpperCase();
    
    await Preferences.set({
      key: INVITE_STORAGE_KEY,
      value: normalizedCode,
    });
    
    console.log("✅ Saved invite:", normalizedCode);
  } catch (error) {
    console.error("Failed to save invite:", error);
    throw error;
  }
};

export const getPendingInvite = async (): Promise<string | null> => {
  try {
    const { value } = await Preferences.get({
      key: INVITE_STORAGE_KEY,
    });
    
    console.log("📦 Retrieved invite:", value);
    return value;
  } catch (error) {
    console.error("Failed to get invite:", error);
    return null;
  }
};

export const clearPendingInvite = async (): Promise<void> => {
  try {
    await Preferences.remove({
      key: INVITE_STORAGE_KEY,
    });
    
    console.log("🗑️ Cleared invite");
  } catch (error) {
    console.error("Failed to clear invite:", error);
  }
};

export const savePendingInviteSync = (code: string): void => {
  console.warn("savePendingInviteSync is deprecated. Use async version.");

  localStorage.setItem(INVITE_STORAGE_KEY, code);
};

export const getPendingInviteSync = (): string | null => {
  console.warn("getPendingInviteSync is deprecated. Use async version.");
  return localStorage.getItem(INVITE_STORAGE_KEY);
};

export const clearPendingInviteSync = (): void => {
  console.warn("clearPendingInviteSync is deprecated. Use async version.");
  localStorage.removeItem(INVITE_STORAGE_KEY);
};