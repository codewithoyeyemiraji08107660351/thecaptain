import { useEffect } from "react";
import { App } from "@capacitor/app";
import {
  startBgMusic,
  resumeBgMusic,
  pauseBgMusic,
  isBgMusicEnabled,
} from "@/lib/bg-music";
import { ensureAudioContextResumed } from "@/lib/sounds";

export const useBgMusic = () => {
  useEffect(() => {
    const tryStart = () => {
      ensureAudioContextResumed();
      if (isBgMusicEnabled()) {
        startBgMusic();
        resumeBgMusic();
      }
    };

    // Attempt immediately (works if audio is already unlocked)
    tryStart();

    // One-shot user gesture handlers
    const handler = () => {
      tryStart();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
    };
    
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler);

    // Native app lifecycle listeners
    let pauseListener: { remove: () => void } | null = null;
    let resumeListener: { remove: () => void } | null = null;
    let stateListener: { remove: () => void } | null = null;

    const setupLifecycleListeners = async () => {
      try {
        pauseListener = await App.addListener("pause", () => {
          console.log("📱 App paused - stopping background music");
          pauseBgMusic();
        });

        resumeListener = await App.addListener("resume", () => {
          console.log("📱 App resumed - restarting background music");
          if (isBgMusicEnabled()) {
            resumeBgMusic();
          }
        });

        stateListener = await App.addListener("appStateChange", ({ isActive }) => {
          console.log("📱 App state changed:", isActive ? "active" : "inactive");
          if (!isActive) {
            pauseBgMusic();
          } else if (isBgMusicEnabled()) {
            resumeBgMusic();
          }
        });
      } catch (error) {
        console.error("Failed to setup app lifecycle listeners:", error);
      }
    };

    setupLifecycleListeners();

    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);

      if (pauseListener) pauseListener.remove();
      if (resumeListener) resumeListener.remove();
      if (stateListener) stateListener.remove();
    };
  }, []);
};