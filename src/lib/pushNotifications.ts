import { supabase } from "@/integrations/supabase/client";

/**
 * Send a push notification to a specific user via the backend edge function.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string
) {
  const { data, error } = await supabase.functions.invoke("send-notification", {
    body: { userId, title, body },
  });

  if (error) {
    console.error("Push notification failed:", error);
    return null;
  }
  return data;
}
