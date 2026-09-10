import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLastOnlineHeartbeat(userId: string | undefined) {
  const updateLastSeen = useCallback(async () => {
    if (!userId) return;
    await (supabase.from("profiles") as any).update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000);
    return () => clearInterval(interval);
  }, [userId, updateLastSeen]);
}

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Unknown";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < 2 * 60 * 1000) return "ONLINE";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
