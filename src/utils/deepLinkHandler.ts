import { savePendingInvite } from "@/utils/inviteStorage";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export const setupDeepLinkHandler = () => {
  if (!Capacitor.isNativePlatform()) return;

  // Handle app open from URL
  App.addListener("appUrlOpen", async (event) => {
    console.log("Deep link opened:", event.url);
    
    const url = new URL(event.url);
    const pathParts = url.pathname.split("/");
    const inviteIndex = pathParts.indexOf("invite");
    
    if (inviteIndex !== -1 && pathParts[inviteIndex + 1]) {
      const inviteCode = pathParts[inviteIndex + 1].toUpperCase();
      console.log("Extracted invite code:", inviteCode);

      await savePendingInvite(inviteCode);
    
    }
  });
};