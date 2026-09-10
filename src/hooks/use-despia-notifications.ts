import { useEffect, useRef } from "react";
import despia from "despia-native";
import { isDespiaNative } from "@/lib/platform";

/**
 * Registers the current user's ID with OneSignal via the Despia Native bridge.
 * This links the device to the user so we can send targeted push notifications.
 * Only runs inside the Despia Native runtime.
 */
export function useDespiaNotifications(userId: string | null | undefined) {
  const registered = useRef(false);

  useEffect(() => {
    if (!userId || registered.current) return;
    if (!isDespiaNative()) return;

    despia(`setonesignalplayerid://?user_id=${userId}`);
    registered.current = true;
  }, [userId]);
}
