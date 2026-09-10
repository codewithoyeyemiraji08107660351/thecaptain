import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { Loader2, Play, Check, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { canSpinToday } from "@/lib/streak";
import { playButtonSound, playDailySpinSound } from "@/lib/sounds";
import { trackStat, trackBestSpinReward } from "@/lib/lifetime-stats";
import { Capacitor } from "@capacitor/core";
import { admobService } from "@/services/admobService";

interface DailySpinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SpinReward {
  label: string;
  type: "action_credit" | "super_action_credit" | "nothing" | "chemlight" | "reroll" | "boosted";
  weight: number;
  boostedWeight: number;
}

const REWARDS: SpinReward[] = [
  { label: "+1 Action Credit", type: "action_credit", weight: 5, boostedWeight: 10 },
  { label: "Nothing happened… unlucky 💀", type: "nothing", weight: 10, boostedWeight: 8 },
  { label: "Chemlight ✨", type: "chemlight", weight: 11, boostedWeight: 22 },
  { label: "You got… disappointment.", type: "nothing", weight: 10, boostedWeight: 8 },
  { label: "Roll Again 🎲", type: "reroll", weight: 10, boostedWeight: 14 },
  { label: "Skill issue. That didn't feel random.", type: "nothing", weight: 10, boostedWeight: 8 },
  { label: "+1 Super Credit", type: "super_action_credit", weight: 2, boostedWeight: 4 },
  { label: "You've been robbed. Sorry Sailor.", type: "nothing", weight: 5, boostedWeight: 8 },
  { label: "Boosted Odds 🚀", type: "boosted", weight: 10, boostedWeight: 0 },
  { label: "The sea was calm today…", type: "nothing", weight: 5, boostedWeight: 8 },
  { label: "We almost gave you something", type: "nothing", weight: 12, boostedWeight: 10 },
];

const BOOSTED_REWARDS = REWARDS.filter(r => r.type !== "boosted");
const getRewardPool = (isBoosted: boolean) => (isBoosted ? BOOSTED_REWARDS : REWARDS);

const getPointerSegmentIndex = (rotationValue: number, segmentCount: number) => {
  const normalized = ((rotationValue % 360) + 360) % 360;
  const pointerAngle = (360 - normalized) % 360;
  const segAngle = 360 / segmentCount;
  return Math.floor(pointerAngle / segAngle) % segmentCount;
};

function pickReward(isBoosted: boolean): { reward: SpinReward; index: number } {
  const pool = isBoosted ? BOOSTED_REWARDS : REWARDS;
  const weights = pool.map(r => isBoosted ? r.boostedWeight : r.weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    random -= weights[i];
    if (random <= 0) return { reward: pool[i], index: i };
  }
  return { reward: pool[0], index: 0 };
}

const SEGMENT_COLORS = [
  "hsl(210 45% 28%)", "hsl(280 35% 28%)", "hsl(340 40% 28%)",
  "hsl(160 35% 26%)", "hsl(20 45% 28%)", "hsl(45 40% 28%)",
  "hsl(200 40% 26%)", "hsl(120 30% 26%)", "hsl(260 35% 28%)",
  "hsl(10 40% 26%)", "hsl(180 35% 26%)",
];

// Helper function to ensure valid session
const ensureValidSession = async (): Promise<boolean> => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error("[Supabase] Session error:", sessionError);
      return false;
    }
    
    if (!session) {
      // Try to refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error("[Supabase] Failed to refresh session:", refreshError);
        return false;
      }
      if (!refreshData.session) {
        console.error("[Supabase] No session after refresh");
        return false;
      }
      return true;
    }
    
    // Check if session is about to expire (within 5 minutes)
    const expiresAt = session.expires_at;
    if (expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;
      if (timeUntilExpiry < 300) { // Less than 5 minutes
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error("[Supabase] Failed to refresh session before expiry:", refreshError);
          return false;
        }
        return !!refreshData.session;
      }
    }
    
    return true;
  } catch (err) {
    console.error("[Supabase] Session validation failed:", err);
    return false;
  }
};

const DailySpinDialog = ({ open, onOpenChange }: DailySpinDialogProps) => {
  const { user, refreshProfile } = useAuth();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinReward | null>(null);
  const [canSpin, setCanSpin] = useState(false);
  const [hasReroll, setHasReroll] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [activeSegment, setActiveSegment] = useState<number>(-1);
  const [adLoading, setAdLoading] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [adSessionActive, setAdSessionActive] = useState(false);
  const [extraSpinGranted, setExtraSpinGranted] = useState(false);
  const [hasUsedDailySpin, setHasUsedDailySpin] = useState(false);
  const [hasUsedAdSpin, setHasUsedAdSpin] = useState(false);
  const [adServiceReady, setAdServiceReady] = useState(false);
  const [adPreloaded, setAdPreloaded] = useState(false);
  
  const AD_SPIN_STORAGE_KEY = (userId: string) => `ad_spin_${userId}`;
  const EXTRA_SPIN_STORAGE_KEY = (userId: string) => `extra_spin_${userId}`;
  
  const motionRotation = useMotionValue(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const animControlsRef = useRef<any>(null);
  const lastSegmentRef = useRef<number>(-1);
  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const adTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rewardHandledRef = useRef(false);
  const openRef = useRef(open);
  const spinningRef = useRef(spinning);
  const isMountedRef = useRef(true);
  const userSetRef = useRef(false);
  const isPreloadingRef = useRef(false);
  const isShowingRef = useRef(false);
  const dialogJustOpenedRef = useRef(false);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);
  
  useEffect(() => {
    spinningRef.current = spinning;
  }, [spinning]);

  // Initialize AdMob service with user
  useEffect(() => {
    const initAdService = async () => {
      if (!Capacitor.isNativePlatform()) {
        setAdServiceReady(true);
        return;
      }
      
      if (user?.id && !userSetRef.current) {
        await admobService.setUser(user.id);
        userSetRef.current = true;
        await admobService.initialize();
        setAdServiceReady(true);
      }
    };
    
    if (open) {
      initAdService();
    }
  }, [user?.id, open]);

  const persistSpinState = async (updateData: any) => {
    if (!user?.id) return;
    
    // 🔥 FIX: Ensure valid session before database operation
    const sessionValid = await ensureValidSession();
    if (!sessionValid) {
      throw new Error("Session expired. Please log in again.");
    }
    
    const { error } = await (supabase as any)
      .from("daily_spins")
      .upsert({ ...updateData, user_id: user.id }, { onConflict: "user_id" });
    
    if (error) throw new Error(`Database error: ${error.message || JSON.stringify(error)}`);
  };

  const loadSpinState = useCallback(async () => {
    if (!user?.id || !isMountedRef.current) return;
    setLoading(true);
    
    try {
      // 🔥 FIX: Ensure valid session before loading data
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        toast.error("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      
      const lastAdSpin = localStorage.getItem(AD_SPIN_STORAGE_KEY(user.id));
      const cachedExtraSpin = localStorage.getItem(EXTRA_SPIN_STORAGE_KEY(user.id)) === "true";
      const adSpinUsed = !!lastAdSpin && !canSpinToday(lastAdSpin);

      const { data, error } = await (supabase as any)
        .from("daily_spins")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data && isMountedRef.current) {
        const canSpinTodayFlag = canSpinToday(data.last_spin_at);
        const extraSpinAvailable = cachedExtraSpin;
        const canSpinNow = canSpinTodayFlag || extraSpinAvailable;
        setCanSpin(canSpinNow);
        setHasReroll(data.has_reroll && !canSpinTodayFlag);
        setIsBoosted(data.boosted_odds_until ? new Date(data.boosted_odds_until) > new Date() : false);
        setHasUsedDailySpin(!canSpinTodayFlag);
        setHasUsedAdSpin(adSpinUsed);
        setExtraSpinGranted(extraSpinAvailable);
      } else if (isMountedRef.current) {
        const canSpinTodayFlag = true;
        setCanSpin(true);
        setHasReroll(false);
        setIsBoosted(false);
        setHasUsedDailySpin(!canSpinTodayFlag);
        setHasUsedAdSpin(adSpinUsed);
        setExtraSpinGranted(cachedExtraSpin);
      }
    } catch (error) {
      console.error("[DailySpin] Error loading spin state:", error);
      toast.error("Failed to load spin state. Please refresh.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [user?.id]);

  // Reload spin state when dialog opens
  useEffect(() => {
    if (open) {
      setResult(null);
      motionRotation.set(0);
      setActiveSegment(-1);
      lastSegmentRef.current = -1;
      setApplying(false);
      setAdError(null);
      dialogJustOpenedRef.current = true;
      loadSpinState();
    }
  }, [open, loadSpinState, motionRotation]);

  // Preload ad when dialog opens
  useEffect(() => {
    if (!open || !Capacitor.isNativePlatform() || !adServiceReady) return;
    if (dialogJustOpenedRef.current) {
      dialogJustOpenedRef.current = false;
      return;
    }

    let isCancelled = false;

    const preloadAd = async () => {
      if (isCancelled || !isMountedRef.current) return;
      if (isPreloadingRef.current) return;
      
      try {
        const canWatch = await admobService.canWatchAd('extra_spin');
        
        if (!canWatch || isCancelled || !isMountedRef.current) {
          setAdPreloaded(false);
          return;
        }
        
        // Check if ad is already loaded or loading
        const state = admobService.getCurrentState();
        if (state.isAdLoading || state.isShowingAd) {
          setAdPreloaded(false);
          return;
        }
        
        isPreloadingRef.current = true;
        const success = await admobService.preloadRewardedAd('extra_spin');
        if (isMountedRef.current && !isCancelled) {
          setAdPreloaded(success);
        }
      } catch (e) {
        console.error("[DailySpin] Preload failed:", e);
        if (isMountedRef.current && !isCancelled) {
          setAdPreloaded(false);
        }
      } finally {
        if (isMountedRef.current && !isCancelled) {
          isPreloadingRef.current = false;
        }
      }
    };

    // Delay preload slightly to ensure dialog is fully open
    const timeoutId = setTimeout(() => {
      preloadAd();
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [open, adServiceReady]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      dialogJustOpenedRef.current = true;
      rewardHandledRef.current = false;
      isPreloadingRef.current = false;
      isShowingRef.current = false;
      setAdError(null);
      setAdLoading(false);
      setAdSessionActive(false);
      setAdPreloaded(false);
      if (adTimeoutRef.current) {
        clearTimeout(adTimeoutRef.current);
        adTimeoutRef.current = null;
      }
    }
  }, [open]);

  const displayRewards = isBoosted ? BOOSTED_REWARDS : REWARDS;
  const segmentAngle = 360 / displayRewards.length;

  useEffect(() => {
    if (!spinning || result) return;
    
    let frameId: number;
    const updateSegment = () => {
      const currentRot = motionRotation.get();
      const segIndex = getPointerSegmentIndex(currentRot, displayRewards.length);
      if (segIndex !== lastSegmentRef.current && isMountedRef.current) {
        lastSegmentRef.current = segIndex;
        setActiveSegment(segIndex);
      }
      frameId = requestAnimationFrame(updateSegment);
    };
    
    frameId = requestAnimationFrame(updateSegment);
    return () => cancelAnimationFrame(frameId);
  }, [spinning, result, displayRewards.length, motionRotation]);

  const handleSpin = async () => {
    if (!user?.id || spinning || applying) return;
    if (!canSpin) {
      toast.error("No spins left today");
      return;
    }
    
    playButtonSound();
    setSpinning(true);
    setResult(null);
    if (animControlsRef.current) animControlsRef.current.stop();
    motionRotation.set(0);
    setActiveSegment(-1);
    lastSegmentRef.current = -1;

    const spinRewards = getRewardPool(isBoosted);
    const spinSegmentAngle = 360 / spinRewards.length;
    const { reward, index } = pickReward(isBoosted);
    
    const segCenter = index * spinSegmentAngle + spinSegmentAngle / 2;
    const jitter = (Math.random() - 0.5) * spinSegmentAngle * 0.5;
    const targetSegmentAngle = segCenter + jitter;
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const targetRotation = fullSpins * 360 + (360 - targetSegmentAngle);

    playDailySpinSound({
      durationMs: 10000,
      segments: spinRewards.length,
      totalRotationDeg: targetRotation,
      ease: [0.15, 0.85, 0.35, 1.0],
    });

    animControlsRef.current = animate(motionRotation, targetRotation, {
      duration: 10,
      ease: [0.15, 0.85, 0.35, 1.0],
      onComplete: () => {
        if (isMountedRef.current) {
          setResult(reward);
          setSpinning(false);
          applyReward(reward);
        }
      },
    });

    spinTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && spinningRef.current) {
        setResult(reward);
        setSpinning(false);
        applyReward(reward);
      }
    }, 10000);
  };

  const applyReward = async (reward: SpinReward) => {
    if (!user?.id) {
      toast.error("Please log in to claim rewards");
      return;
    }
    
    setApplying(true);

    try {
      // 🔥 FIX: Ensure valid session before any database operations
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        toast.error("Session expired. Please log in again.");
        setApplying(false);
        return;
      }

      const isUsingReroll = hasReroll;
      const isExtraSpin = extraSpinGranted;
      
      const updateData: any = { user_id: user.id, has_reroll: reward.type === "reroll" };

      if (!isExtraSpin) {
        updateData.last_spin_at = new Date().toISOString();
        setHasUsedDailySpin(true);
      } else {
        setHasUsedAdSpin(true);
        if (user?.id) {
          localStorage.removeItem(EXTRA_SPIN_STORAGE_KEY(user.id));
        }
      }

      if (isUsingReroll) updateData.has_reroll = reward.type === "reroll";

      if (reward.type === "boosted") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);
        updateData.boosted_odds_until = tomorrow.toISOString();
      }
      
      if (reward.type === "chemlight") {
        updateData.chemlight_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      await persistSpinState(updateData);
      await trackStat(user.id, "total_spins");
      if (reward.type !== "nothing") await trackBestSpinReward(user.id, reward.label);

      if (reward.type === "action_credit") {
        await trackStat(user.id, "spin_action_credits_earned");
        
        // 🔥 FIX: Ensure valid session before RPC call
        const rpcSessionValid = await ensureValidSession();
        if (!rpcSessionValid) {
          throw new Error("Session expired. Please log in again.");
        }
        
        const { error: rpcError } = await supabase.rpc("award_spin_credit", { _credit_type: "action_credit" });
        if (rpcError) throw new Error(`RPC error: ${rpcError.message}`);
        await refreshProfile();
      } else if (reward.type === "super_action_credit") {
        await trackStat(user.id, "spin_super_credits_earned");
        
        // 🔥 FIX: Ensure valid session before RPC call
        const rpcSessionValid = await ensureValidSession();
        if (!rpcSessionValid) {
          throw new Error("Session expired. Please log in again.");
        }
        
        const { error: rpcError } = await supabase.rpc("award_spin_credit", { _credit_type: "super_action_credit" });
        if (rpcError) throw new Error(`RPC error: ${rpcError.message}`);
        await refreshProfile();
      }
      
      if (reward.type === "boosted") setIsBoosted(true);
      
      if (reward.type === "reroll") {
        setCanSpin(true);
        setHasReroll(true);
      } else if (isExtraSpin) {
        setExtraSpinGranted(false);
        setCanSpin(false);
        setHasReroll(false);
      } else {
        setCanSpin(false);
        setHasReroll(false);
      }
      
      if (reward.type !== "nothing") toast.success(getResultMessage(reward));
      
    } catch (err) {
      console.error("[DailySpin] Failed to apply reward:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to apply reward. Please try again.";
      
      // Check for JWT expired error
      if (errorMsg.includes("JWT expired") || errorMsg.includes("Session expired")) {
        toast.error("Session expired. Please log out and log in again.");
        // Optionally trigger a logout or session refresh
        // You might want to dispatch a logout event here
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setApplying(false);
    }
  };

  // Ad reward listener - grants extra spin
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !adServiceReady) return;
    
    let isSubscribed = true;
    
    const handleAdReward = () => {
      if (!isSubscribed || !isMountedRef.current) return;
      if (rewardHandledRef.current) return;
      if (!openRef.current) return;
      
      rewardHandledRef.current = true;
      
      if (adTimeoutRef.current) {
        clearTimeout(adTimeoutRef.current);
        adTimeoutRef.current = null;
      }
      
      if (user?.id) {
        localStorage.setItem(AD_SPIN_STORAGE_KEY(user.id), new Date().toISOString());
        localStorage.setItem(EXTRA_SPIN_STORAGE_KEY(user.id), "true");
      }
      
      setHasUsedAdSpin(true);
      setExtraSpinGranted(true);
      setCanSpin(true);
      setAdLoading(false);
      setAdSessionActive(false);
      setAdError(null);
      isShowingRef.current = false;
      
      toast.success("🎡 Extra spin unlocked! Spin now!");
      
      setTimeout(() => {
        if (isMountedRef.current) {
          loadSpinState();
        }
      }, 100);
    };
    
    const handleAdError = (error: string) => {
      if (!isSubscribed || !isMountedRef.current) return;
      setAdError(error);
      setAdLoading(false);
      setAdSessionActive(false);
      isShowingRef.current = false;
      toast.error(`Ad failed: ${error}`);
    };
    
    const removeRewardListener = admobService.onReward('extra_spin', handleAdReward);
    const removeErrorListener = admobService.onError('extra_spin', handleAdError);
    const removeVerificationListener = admobService.onVerification('extra_spin', (result: any) => {
      if (!isSubscribed || !isMountedRef.current) return;
      if (result?.success) {
        // Treat as reward event
        handleAdReward();
      } else {
        const message = result?.error || 'Verification failed';
        handleAdError(message);
      }
    });
    
    return () => {
      isSubscribed = false;
      removeRewardListener();
      removeErrorListener();
      removeVerificationListener();
    };
  }, [adServiceReady, loadSpinState]);

  const handleWatchAd = async () => {
    if (!adServiceReady) {
      toast.info("Ads are initializing. Please wait a moment.");
      return;
    }
    
    if (adSessionActive || adLoading || isShowingRef.current) {
      toast.info("Ad is already loading or playing");
      return;
    }
    
    if (!user?.id) {
      toast.error("Please log in to watch ads");
      return;
    }
    
    if (hasUsedAdSpin) {
      toast.info("You've already used your daily ad spin. Come back tomorrow!");
      return;
    }
    
    if (extraSpinGranted) {
      toast.info("You already have an extra spin available! Spin it first.");
      return;
    }
    
    if (isPreloadingRef.current) {
      toast.info("Ad is loading. Please wait a moment.");
      return;
    }
    
    const canWatch = await admobService.canWatchAd('extra_spin');
    if (!canWatch) {
      toast.info("Daily ad limit reached. Come back tomorrow!");
      return;
    }
    
    rewardHandledRef.current = false;
    isShowingRef.current = true;
    
    playButtonSound();
    setAdLoading(true);
    setAdSessionActive(true);
    setAdError(null);
    
    adTimeoutRef.current = setTimeout(() => {
      if (!rewardHandledRef.current && isMountedRef.current && isShowingRef.current) {
        console.warn("[DailySpin] Ad timeout - no reward received");
        setAdLoading(false);
        setAdSessionActive(false);
        setAdError("Ad timed out. Please try again.");
        toast.error("Ad timed out. Please try again.");
        isShowingRef.current = false;
      }
    }, 60000);
    
    try {
      const success = await admobService.showRewardedAd('extra_spin');
      
      if (!success && !rewardHandledRef.current && isMountedRef.current) {
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        setAdLoading(false);
        setAdSessionActive(false);
        isShowingRef.current = false;
        
        if (!rewardHandledRef.current) {
          setAdError("Failed to show ad. Please try again.");
          toast.error("Failed to load ad. Please try again.");
        }
      }
    } catch (error) {
      console.error("[DailySpin] Rewarded ad error:", error);
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      setAdLoading(false);
      setAdSessionActive(false);
      isShowingRef.current = false;
      const errorMsg = error instanceof Error ? error.message : 'Failed to load ad';
      setAdError(errorMsg);
      toast.error(`Failed to load ad: ${errorMsg}`);
    }
  };

  const getResultMessage = (reward: SpinReward) => {
    switch (reward.type) {
      case "action_credit": return "🎉 +1 Action Credit awarded!";
      case "super_action_credit": return "🎉 +1 Super Action Credit awarded!";
      case "chemlight": return "✨ Chemlight activated! Your messages will glow for 24 hours.";
      case "reroll": return "🎲 You earned a Re-Roll! Spin again!";
      case "boosted": return "🚀 Boosted Odds activated for your next spin!";
      default: return reward.label;
    }
  };

  const getResultColor = (reward: SpinReward) => {
    switch (reward.type) {
      case "action_credit":
      case "super_action_credit": return "text-green-400";
      case "chemlight": return "text-amber-400";
      case "reroll": return "text-blue-400";
      case "boosted": return "text-purple-400";
      default: return "text-muted-foreground";
    }
  };

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      if (animControlsRef.current) animControlsRef.current.stop();
      rewardHandledRef.current = false;
      isPreloadingRef.current = false;
      isShowingRef.current = false;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => { 
      if (!v && (spinning || applying)) return; 
      if (!v) {
        if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        rewardHandledRef.current = false;
        setAdLoading(false);
        setAdSessionActive(false);
        setAdError(null);
        isShowingRef.current = false;
      }
      onOpenChange(v); 
    }}>
      <DialogContent className="bg-card border-border max-w-sm p-4 overflow-hidden" onPointerDownOutside={(e) => { if (result && !spinning) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="text-lg font-display text-center">
            ⚓ Daily Spin
            {isBoosted && <span className="text-xs text-purple-400 ml-2">🚀 BOOSTED</span>}
            {extraSpinGranted && <span className="text-xs text-accent ml-2 animate-pulse">🎡 EXTRA SPIN</span>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-64 h-64">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-primary" />
              <motion.div ref={wheelRef} className="w-full h-full rounded-full border-2 border-border relative overflow-hidden" style={{ rotate: motionRotation }}>
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {displayRewards.map((reward, i) => {
                    const startAngle = i * segmentAngle - 90;
                    const endAngle = startAngle + segmentAngle;
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;
                    const x1 = 100 + 100 * Math.cos(startRad);
                    const y1 = 100 + 100 * Math.sin(startRad);
                    const x2 = 100 + 100 * Math.cos(endRad);
                    const y2 = 100 + 100 * Math.sin(endRad);
                    const largeArc = segmentAngle > 180 ? 1 : 0;
                    const midAngle = ((startAngle + endAngle) / 2) * Math.PI / 180;
                    const labelX = 100 + 65 * Math.cos(midAngle);
                    const labelY = 100 + 65 * Math.sin(midAngle);
                    const labelRotation = (startAngle + endAngle) / 2 + 90;
                    let shortLabel = reward.label;
                    if (reward.type === "action_credit") shortLabel = "+1 AC";
                    else if (reward.type === "super_action_credit") shortLabel = "+1 SC";
                    else if (reward.type === "chemlight") shortLabel = "✨";
                    else if (reward.type === "reroll") shortLabel = "🎲";
                    else if (reward.type === "boosted") shortLabel = "🚀";
                    else if (reward.type === "nothing") shortLabel = "💀";
                    const isActive = activeSegment === i;
                    const isDimmed = activeSegment !== -1 && !isActive;
                    return (
                      <g key={i} opacity={isDimmed ? 0.35 : 1}>
                        <path d={`M100,100 L${x1},${y1} A100,100 0 ${largeArc},1 ${x2},${y2} Z`} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} stroke={isActive ? "white" : "hsl(var(--border))"} strokeWidth={isActive ? "1.5" : "0.5"} />
                        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={isActive ? "10" : "8"} fontWeight="bold" transform={`rotate(${labelRotation}, ${labelX}, ${labelY})`}>{shortLabel}</text>
                      </g>
                    );
                  })}
                  <circle cx="100" cy="100" r="15" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
                  <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize="10">⚓</text>
                </svg>
              </motion.div>
            </div>

            <AnimatePresence>
              {result && !spinning && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center px-4">
                  <p className={`font-display font-bold text-sm ${getResultColor(result)}`}>{getResultMessage(result)}</p>
                  {applying && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-2 text-muted-foreground" />}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Spin Button - shows when canSpin is true */}
            {canSpin && !spinning ? (
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full font-display" 
                onClick={handleSpin} 
                disabled={applying}
              >
                {hasReroll ? "🎲 Re-Roll!" : extraSpinGranted ? "🎡 Extra Spin!" : "✨ Can Spin!"}
              </Button>
            ) : null}
            
            {/* No spins left - Show ad option */}
            {!spinning && !canSpin ? (
              <div className="text-center space-y-3 w-full">
                <p className="text-sm text-muted-foreground">
                  {extraSpinGranted ? "You have an extra spin ready!" : "❌ No spins left today"}
                </p>
                
                {Capacitor.isNativePlatform() && adServiceReady && !hasUsedAdSpin && !extraSpinGranted && (
                  <Button
                    onClick={handleWatchAd}
                    disabled={adSessionActive || adLoading || isPreloadingRef.current}
                    variant="outline"
                    size="lg"
                    className="w-full border-accent/30 text-accent hover:bg-accent/10"
                  >
                    {isPreloadingRef.current ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Preparing Ad...
                      </>
                    ) : adLoading || adSessionActive ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading Ad...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Watch Ad for 1 Extra Spin
                      </>
                    )}
                  </Button>
                )}
                
                {Capacitor.isNativePlatform() && !adServiceReady && user?.id && (
                  <div className="flex items-center justify-center gap-2 text-sm text-yellow-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing ads...
                  </div>
                )}
                
                {Capacitor.isNativePlatform() && hasUsedAdSpin && !extraSpinGranted && (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    ✅ Daily ad spin claimed — come back tomorrow!
                  </div>
                )}
                
                {adError && (
                  <div className="flex items-center justify-center gap-2 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" /> {adError}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleWatchAd}
                      className="h-6 px-2 text-xs"
                      disabled={isPreloadingRef.current || adLoading}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Retry
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DailySpinDialog;