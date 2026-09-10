import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, ShoppingBag, CreditCard, ArrowLeft, Crown, Smartphone, Play, Loader2, RefreshCw, AlertCircle, Check, Star, Gift, Bug } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playButtonSound, playUpgradeSound } from "@/lib/sounds";
import { isDespiaNative, getPlatform } from "@/lib/platform";
import { DEV_FREE_FULL_VERSION } from "@/lib/dev-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePurchase } from "@/contexts/PurchaseContext";
import { Capacitor } from "@capacitor/core";
import { admobService } from "@/services/admobService";
import { Preferences } from '@capacitor/preferences';

const AD_WATCHED_KEY = 'shop_ad_watched_today';

const getTodayString = (): string => {
  return new Date().toDateString();
};

// Async functions for Capacitor Preferences
const getAdWatchedToday = async (): Promise<boolean> => {
  try {
    if (!Capacitor.isNativePlatform()) {
      // Fallback to localStorage for web
      const stored = localStorage.getItem(AD_WATCHED_KEY);
      if (!stored) return false;
      const data = JSON.parse(stored);
      return data.date === getTodayString();
    }
    
    const { value } = await Preferences.get({ key: AD_WATCHED_KEY });
    if (!value) return false;
    const data = JSON.parse(value);
    return data.date === getTodayString();
  } catch {
    return false;
  }
};

const setAdWatchedTodayStorage = async (): Promise<void> => {
  try {
    const data = JSON.stringify({ date: getTodayString() });
    if (!Capacitor.isNativePlatform()) {
      // Fallback to localStorage for web
      localStorage.setItem(AD_WATCHED_KEY, data);
      return;
    }
    await Preferences.set({ key: AD_WATCHED_KEY, value: data });
  } catch (error) {
    console.error("[ShopDialog] Failed to set ad watched state:", error);
  }
};

const clearAdWatchedTodayStorage = async (): Promise<void> => {
  try {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(AD_WATCHED_KEY);
      return;
    }
    await Preferences.remove({ key: AD_WATCHED_KEY });
  } catch (error) {
    console.error("[ShopDialog] Failed to clear ad watched state:", error);
  }
};

interface ShopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPremium: boolean;
  actionCredits: number;
  superActionCredits: number;
  userId?: string;
  onBuyFullVersion: () => void;
  onBuyActions: () => void;
  onBuySuperActions: () => void;
  onAdRewardGranted?: () => void;
}

const PRODUCT_IDS = {
  FULL_VERSION: 'the_captain_full_version',  
  ACTION_CREDITS_10: '10_action_credits',
  SUPER_CREDITS_6: '6_super_credits',
};

const PRODUCT_PRICES = {
  FULL_VERSION: '$1.99',
  ACTION_CREDITS_10: '$0.99',
  SUPER_CREDITS_6: '$0.99',
};

type PaymentOption = "full_version" | "actions" | "super_actions" | null;

const ShopDialog = ({ 
  open, 
  onOpenChange, 
  isPremium, 
  actionCredits, 
  superActionCredits, 
  userId, 
  onBuyFullVersion, 
  onBuyActions, 
  onBuySuperActions, 
  onAdRewardGranted 
}: ShopDialogProps) => {
  const { user, refreshProfile } = useAuth();
  const { purchaseProduct, restorePurchases, isLoading: purchaseLoading, refreshPremiumStatus } = usePurchase();
  
  const [showPayment, setShowPayment] = useState<PaymentOption>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<"full_version" | "actions" | "super_actions" | null>(null);
  
  // 🔥 FIX: Initialize from Capacitor Preferences instead of always false
  const [adWatchedToday, setAdWatchedToday] = useState(false);
  const [adWatchedLoaded, setAdWatchedLoaded] = useState(false);
  
  const [adLoading, setAdLoading] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [adSessionActive, setAdSessionActive] = useState(false);
  const [adCooldown, setAdCooldown] = useState(false);
  const [adServiceReady, setAdServiceReady] = useState(false);
  const [adPreloaded, setAdPreloaded] = useState(false);
  const [localActionCredits, setLocalActionCredits] = useState(actionCredits);
  const [localSuperCredits, setLocalSuperCredits] = useState(superActionCredits);

  // Refs
  const rewardProcessedRef = useRef(false);
  const adTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const userSetRef = useRef(false);
  const isPreloadingRef = useRef(false);
  const isShowingRef = useRef(false);
  const dialogJustOpenedRef = useRef(false);

  // Update local credits when props change
  useEffect(() => {
    setLocalActionCredits(actionCredits);
    setLocalSuperCredits(superActionCredits);
  }, [actionCredits, superActionCredits]);

  // Mounted state tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load ad watched state from Capacitor Preferences when dialog opens
  useEffect(() => {
    const loadAdWatchedState = async () => {
      if (!open) return;
      
      try {
        const watched = await getAdWatchedToday();
        if (isMountedRef.current) {
          setAdWatchedToday(watched);
          setAdWatchedLoaded(true);
        }
      } catch (error) {
        console.error("[ShopDialog] Failed to load ad watched state:", error);
        if (isMountedRef.current) {
          setAdWatchedToday(false);
          setAdWatchedLoaded(true);
        }
      }
    };
    
    loadAdWatchedState();
  }, [open]);

  // Initialize AdMob service with user
  useEffect(() => {
    const initAdService = async () => {
      if (!Capacitor.isNativePlatform()) {
        setAdServiceReady(true);
        return;
      }
      
      if (user?.id && !userSetRef.current) {
        console.log("[ShopDialog] Initializing AdMob for user:", user.id);
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

  // 🔥 FIX: Sync ad state with Capacitor Preferences and server
  const syncAdState = useCallback(async () => {
    if (!open || !adServiceReady || !isMountedRef.current) return;
    
    try {
      const canWatch = await admobService.canWatchAd('action_credit');
      const watched = !canWatch;
      
      if (isMountedRef.current) {
        setAdWatchedToday(watched);
        if (watched) {
          await setAdWatchedTodayStorage();
        } else {
          // Server says can watch, but storage might have old data from a previous day
          const storedWatched = await getAdWatchedToday();
          if (storedWatched) {
            await clearAdWatchedTodayStorage();
          }
        }
      }
    } catch (error) {
      console.error("[ShopDialog] Failed to sync ad state:", error);
      // Fallback to stored value
      const storedWatched = await getAdWatchedToday();
      if (isMountedRef.current) {
        setAdWatchedToday(storedWatched);
      }
    }
  }, [open, adServiceReady]);

  // Refresh user credits after reward
  const refreshCredits = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      await refreshProfile();
      if (onAdRewardGranted) {
        await onAdRewardGranted();
      }
    } catch (error) {
      console.error("[ShopDialog] Failed to refresh credits:", error);
    }
  }, [user?.id, refreshProfile, onAdRewardGranted]);

  // Handle ad reward
  const handleAdReward = useCallback(async (rewardData: any) => {
    if (rewardProcessedRef.current || !isMountedRef.current) return;

    rewardProcessedRef.current = true;

    if (adTimeoutRef.current) {
      clearTimeout(adTimeoutRef.current);
      adTimeoutRef.current = null;
    }

    setAdLoading(false);
    setAdSessionActive(false);
    setAdError(null);
    isShowingRef.current = false;

    try {
      const creditsAwarded = rewardData?.credits_awarded || 1;
      
      // 🔥 FIX: Mark as watched and persist to Capacitor Preferences
      setAdWatchedToday(true);
      await setAdWatchedTodayStorage();
      
      toast.success(`+${creditsAwarded} Action Credit earned!`);
      await refreshCredits();

      setAdCooldown(true);
      setTimeout(() => {
        if (isMountedRef.current) setAdCooldown(false);
      }, 3000);
    } catch (err) {
      console.error("[ShopDialog] Reward processing error:", err);
      toast.error("Reward processing failed. Please try again.");
      rewardProcessedRef.current = false;
    }
  }, [refreshCredits]);

  // Set up reward listener
  useEffect(() => {
    if (!open || !Capacitor.isNativePlatform() || !adServiceReady) return;
    
    const removeRewardListener = admobService.onReward("action_credit", handleAdReward);
    const removeErrorListener = admobService.onError("action_credit", (error) => {
      if (!isMountedRef.current) return;
      setAdError(error);
      setAdLoading(false);
      setAdSessionActive(false);
      isShowingRef.current = false;
      if (!rewardProcessedRef.current) {
        toast.error(`Ad failed: ${error}`);
      }
    });

    const removeVerificationListener = admobService.onVerification("action_credit", (result: any) => {
      if (!isMountedRef.current) return;
      if (result?.success) {
        try {
          handleAdReward(result);
        } catch (e) {
          console.error('[ShopDialog] verification handler error', e);
        }
      } else {
        const message = result?.error || 'Verification failed';
        setAdError(message);
        setAdLoading(false);
        setAdSessionActive(false);
        isShowingRef.current = false;
        if (!rewardProcessedRef.current) toast.error(`Ad verification failed: ${message}`);
      }
    });
    
    return () => {
      removeRewardListener();
      removeErrorListener();
      removeVerificationListener();
    };
  }, [open, adServiceReady, handleAdReward]);

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
        await syncAdState();
        const canWatch = await admobService.canWatchAd("action_credit");
        
        if (!canWatch || isCancelled || !isMountedRef.current) {
          setAdPreloaded(false);
          return;
        }
        
        const state = admobService.getCurrentState();
        if (state.isAdLoading || state.isShowingAd) {
          setAdPreloaded(false);
          return;
        }
        
        isPreloadingRef.current = true;
        const success = await admobService.preloadRewardedAd("action_credit");
        if (isMountedRef.current && !isCancelled) {
          setAdPreloaded(success);
        }
      } catch (e) {
        console.error("[ShopDialog] Preload failed:", e);
        if (isMountedRef.current && !isCancelled) {
          setAdPreloaded(false);
        }
      } finally {
        if (isMountedRef.current && !isCancelled) {
          isPreloadingRef.current = false;
        }
      }
    };

    const timeoutId = setTimeout(() => {
      preloadAd();
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [open, adServiceReady, syncAdState]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      dialogJustOpenedRef.current = true;
      rewardProcessedRef.current = false;
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

  // 🔥 FIX: Watch for user changes to sync ad state
  useEffect(() => {
    if (!userId || !open || !adServiceReady) return;
    syncAdState();
  }, [userId, open, adServiceReady, syncAdState]);

  // 🔥 FIX: Sync when dialog opens and service is ready
  useEffect(() => {
    if (open && adServiceReady && adWatchedLoaded) {
      syncAdState();
    }
  }, [open, adServiceReady, syncAdState, adWatchedLoaded]);

  // Helper functions for credit granting
  const grantActionCredits = async (amount: number): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc("add_action_credits" as any, { amount });
      if (error) {
        console.error("[ShopDialog] Failed to grant action credits:", error);
        return false;
      }
      await refreshProfile();
      return true;
    } catch (error) {
      console.error("[ShopDialog] Error granting action credits:", error);
      return false;
    }
  };

  const grantSuperCredits = async (amount: number): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc("add_super_credits" as any, { amount });
      if (error) {
        console.error("[ShopDialog] Failed to grant super credits:", error);
        return false;
      }
      await refreshProfile();
      return true;
    } catch (error) {
      console.error("[ShopDialog] Error granting super credits:", error);
      return false;
    }
  };

  const handlePurchase = async (type: "full_version" | "actions" | "super_actions") => {
    if (!user?.id) {
      toast.error("Please log in to make purchases");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      toast.error("Purchases are only available in the mobile app");
      return;
    }

    setProcessing(true);
    setSelectedProduct(type);
    
    try {
      let productId: string;
      let successCallback: () => Promise<void>;
      let errorMessage: string;

      switch (type) {
        case "full_version":
          productId = PRODUCT_IDS.FULL_VERSION;
          successCallback = async () => {
            let isNowPremium = false;
            for (let i = 0; i < 3; i++) {
              const premium = await refreshPremiumStatus();
              if (premium) {
                isNowPremium = true;
                break;
              }
              if (i < 2) await new Promise(r => setTimeout(r, 1500));
            }
            
            if (isNowPremium) {
              toast.success("Full Version unlocked! 🎉");
            } else {
              toast.warning("Purchase successful! Full Version access may take a moment to activate.");
            }
            onBuyFullVersion();
          };
          errorMessage = "Failed to unlock Full Version";
          break;
        case "actions":
          productId = PRODUCT_IDS.ACTION_CREDITS_10;
          successCallback = async () => {
            const granted = await grantActionCredits(10);
            if (granted) {
              toast.success("10 Action Credits purchased and added to your account!");
              onBuyActions();
            } else {
              toast.error("Credits were purchased but failed to add. Please contact support.");
            }
          };
          errorMessage = "Failed to purchase Action Credits";
          break;
        case "super_actions":
          productId = PRODUCT_IDS.SUPER_CREDITS_6;
          successCallback = async () => {
            const granted = await grantSuperCredits(6);
            if (granted) {
              toast.success("6 Super Action Credits purchased and added to your account!");
              onBuySuperActions();
            } else {
              toast.error("Super Credits were purchased but failed to add. Please contact support.");
            }
          };
          errorMessage = "Failed to purchase Super Action Credits";
          break;
        default:
          return;
      }

      const success = await purchaseProduct(productId);
      
      if (success) {
        await successCallback();
        setShowPayment(null);
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("[ShopDialog] Purchase error:", error);
      toast.error("Purchase failed. Please try again.");
    } finally {
      setProcessing(false);
      setSelectedProduct(null);
    }
  };

  const handleRestorePurchases = async () => {
    if (!user?.id) {
      toast.error("Please log in to restore purchases");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      toast.error("Restore purchases only available in mobile app");
      return;
    }

    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        let isNowPremium = false;
        for (let i = 0; i < 3; i++) {
          const premium = await refreshPremiumStatus();
          if (premium) {
            isNowPremium = true;
            break;
          }
          if (i < 2) await new Promise(r => setTimeout(r, 1500));
        }
        
        toast.success("Purchases restored successfully! 🎉");
        
        if (isNowPremium) {
          setTimeout(() => {
            onOpenChange(false);
            onBuyFullVersion();
          }, 1500);
        }
      } else {
        toast.info("No previous purchases found");
      }
    } catch (error) {
      console.error("[ShopDialog] Restore error:", error);
      toast.error("Failed to restore purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const handleBack = () => {
    setShowPayment(null);
    setCardNumber(""); 
    setExpiry(""); 
    setCvc("");
  };

  const handleWatchAd = async () => {
    // Check if ad watched state is loaded
    if (!adWatchedLoaded) {
      toast.info("Loading ad state. Please wait a moment.");
      return;
    }

    // Check service readiness
    if (!adServiceReady) {
      toast.info("Ads are initializing. Please wait a moment.");
      return;
    }
    
    // Check if ad is already showing or loading
    if (adLoading || adSessionActive || isShowingRef.current) {
      toast.info("Please wait for current ad to complete");
      return;
    }

    // Check cooldown
    if (adCooldown) {
      toast.info("Please wait a moment before watching another ad");
      return;
    }

    // 🔥 FIX: Check if already claimed today (from Capacitor Preferences)
    if (adWatchedToday) {
      toast.info("You've already claimed today's free credit! Come back tomorrow.");
      return;
    }

    // Check if ad is currently preloading - wait for it
    if (isPreloadingRef.current) {
      toast.info("Ad is loading. Please wait a moment.");
      return;
    }

    rewardProcessedRef.current = false;
    isShowingRef.current = true;
    
    setAdLoading(true);
    setAdSessionActive(true);
    setAdError(null);
    playButtonSound();

    // Set timeout
    adTimeoutRef.current = setTimeout(() => {
      if (!rewardProcessedRef.current && isMountedRef.current && isShowingRef.current) {
        console.warn("[ShopDialog] Ad timeout - no reward received");
        setAdLoading(false);
        setAdSessionActive(false);
        setAdError("Ad timed out. Please try again.");
        toast.error("Ad failed to load. Please try again.");
        isShowingRef.current = false;
      }
      adTimeoutRef.current = null;
    }, 60000);

    try {
      // Check if user can watch
      const canWatch = await admobService.canWatchAd("action_credit");
      if (!canWatch) {
        await syncAdState();
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        setAdLoading(false);
        setAdSessionActive(false);
        isShowingRef.current = false;
        toast.info("Daily limit reached. Come back tomorrow!");
        return;
      }

      // Small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Show the ad - this will use the preloaded ad if available
      const success = await admobService.showRewardedAd("action_credit");

      // If showRewardedAd returned false and we haven't received reward
      if (!success && !rewardProcessedRef.current && isMountedRef.current) {
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        setAdLoading(false);
        setAdSessionActive(false);
        setAdError("Failed to load ad. Please try again.");
        toast.error("Failed to load ad. Please try again.");
        isShowingRef.current = false;
      }
    } catch (error) {
      console.error("[ShopDialog] Rewarded ad error:", error);
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      if (isMountedRef.current) {
        setAdLoading(false);
        setAdSessionActive(false);
        const message = error instanceof Error ? error.message : "Failed to load rewarded ad";
        setAdError(message);
        toast.error(message);
        isShowingRef.current = false;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      rewardProcessedRef.current = false;
      isPreloadingRef.current = false;
      isShowingRef.current = false;
    };
  }, []);

  const native = isDespiaNative();
  const platform = getPlatform();

  // Payment dialog view
  if (showPayment) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <button onClick={handleBack} className="p-1 -ml-2 hover:bg-accent/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {showPayment === "full_version" && "Full Version"}
              {showPayment === "actions" && "Buy Action Credits"}
              {showPayment === "super_actions" && "Buy Super Action Credits"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="card-number">Card Number</Label>
              <Input
                id="card-number"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry</Label>
                <Input
                  id="expiry"
                  placeholder="MM/YY"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  placeholder="123"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value)}
                  className="bg-secondary/50"
                />
              </div>
            </div>

            <Button
              className="w-full h-11 mt-2"
              onClick={() => {
                if (showPayment === "full_version") handlePurchase("full_version");
                else if (showPayment === "actions") handlePurchase("actions");
                else if (showPayment === "super_actions") handlePurchase("super_actions");
              }}
              disabled={processing || purchaseLoading || restoring}
            >
              {(processing || purchaseLoading) && selectedProduct === (
                showPayment === "full_version" ? "full_version" :
                showPayment === "actions" ? "actions" :
                "super_actions"
              ) ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              {processing || purchaseLoading ? "Processing..." : `Pay ${showPayment === "full_version" ? PRODUCT_PRICES.FULL_VERSION : showPayment === "actions" ? PRODUCT_PRICES.ACTION_CREDITS_10 : PRODUCT_PRICES.SUPER_CREDITS_6}`}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {showPayment === "full_version" 
                ? "One-time payment. Lifetime access." 
                : "Payment will be processed securely."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main shop dialog view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Shop
          </DialogTitle>
        </DialogHeader>

        {Capacitor.isNativePlatform() && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRestorePurchases}
              disabled={restoring || processing || purchaseLoading}
              className="text-xs"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${restoring ? 'animate-spin' : ''}`} />
              {restoring ? "Restoring..." : "Restore Purchases"}
            </Button>
          </div>
        )}

        {/* Credit balances */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 p-3 rounded-xl bg-accent/10 border border-accent/20 text-center transition-all duration-300">
            <p className="text-2xl font-display font-bold text-accent">{localActionCredits}</p>
            <p className="text-[10px] text-muted-foreground">Action Credits</p>
          </div>
          <div className="flex-1 p-3 rounded-xl border text-center transition-all duration-300" style={{ background: "hsl(270 80% 60% / 0.1)", borderColor: "hsl(270 80% 60% / 0.2)" }}>
            <p className="text-2xl font-display font-bold" style={{ color: "hsl(270 80% 60%)" }}>{localSuperCredits}</p>
            <p className="text-[10px] text-muted-foreground">Super Credits</p>
          </div>
        </div>

        {/* Ad error display */}
        {adError && (
          <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center mb-3">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            {adError}
          </div>
        )}

        {/* Ad service not ready warning */}
        {Capacitor.isNativePlatform() && !adServiceReady && user?.id && (
          <div className="p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs text-center mb-3">
            <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
            Initializing ads...
          </div>
        )}

        {/* Loading ad watched state */}
        {!adWatchedLoaded && (
          <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs text-center mb-3">
            <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
            Loading ad state...
          </div>
        )}

        <div className="space-y-4">
          {/* FULL VERSION - ONE-TIME PURCHASE */}
          {!isPremium && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-bl-lg">RECOMMENDED</div>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display font-bold text-base">Full Version</p>
                    <span className="text-xl font-bold text-primary">{PRODUCT_PRICES.FULL_VERSION}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">One-time purchase · Lifetime access</p>
                </div>
              </div>
              <ul className="space-y-1 mb-3">
                <li className="text-xs flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500" />Unlimited squads</li>
                <li className="text-xs flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500" />Exclusive themes</li>
                <li className="text-xs flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500" />Advanced statistics</li>
                <li className="text-xs flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500" />Squad reordering</li>
                <li className="text-xs flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500" />Priority support</li>
              </ul>
              <Button variant="hero" className="w-full h-11" onClick={() => {
                playUpgradeSound();
                if (DEV_FREE_FULL_VERSION) handlePurchase("full_version");
                else if (Capacitor.isNativePlatform()) handlePurchase("full_version");
                else setShowPayment("full_version");
              }} disabled={processing || purchaseLoading || restoring}>
                {(processing && selectedProduct === "full_version") || (purchaseLoading && selectedProduct === "full_version") ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (<Crown className="w-4 h-4 mr-2" />)}
                {(processing && selectedProduct === "full_version") || (purchaseLoading && selectedProduct === "full_version") ? "Processing..." : `Buy Full Version • ${PRODUCT_PRICES.FULL_VERSION}`}
              </Button>
            </div>
          )}

          {/* Already Purchased Message */}
          {isPremium && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 text-center">
              <Crown className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="font-bold text-amber-600 dark:text-amber-400">🎉 Full Version Active!</p>
              <p className="text-xs text-muted-foreground mt-1">Thank you for supporting The Captain</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={handleRestorePurchases} disabled={restoring || processing || purchaseLoading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? "Restoring..." : "Restore Purchases"}
              </Button>
            </div>
          )}

          {/* FREE ACTION CREDIT AD REWARD - ONE AD PER DAY */}
          <div className={`p-4 rounded-xl bg-secondary/50 border transition-all duration-300 ${
            adWatchedToday 
              ? 'border-green-500/30' 
              : adSessionActive 
                ? 'border-accent/50 shadow-lg shadow-accent/10' 
                : 'border-accent/20'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 ${
                adSessionActive 
                  ? 'bg-accent/20 animate-pulse' 
                  : adWatchedToday 
                    ? 'bg-green-500/10' 
                    : 'bg-accent/10'
              }`}>
                {adSessionActive ? (
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                ) : adWatchedToday ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Gift className="w-5 h-5 text-accent" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-display font-bold text-sm">
                  {adWatchedToday 
                    ? "Daily Reward Claimed! ✅" 
                    : adSessionActive 
                      ? "Watching Ad..." 
                      : "Free Action Credit"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {adWatchedToday 
                    ? "You've already earned your free credit today. Come back tomorrow!" 
                    : adSessionActive 
                      ? "Please wait while your ad plays..." 
                      : "Watch a short ad to earn +1 Action Credit"}
                </p>
              </div>
            </div>
            
            {!adWatchedToday && !adSessionActive && (
              <p className="text-[10px] text-muted-foreground mb-2 text-center">Once daily · Resets at midnight</p>
            )}
            
            <Button 
              onClick={handleWatchAd} 
              disabled={!adWatchedLoaded || adSessionActive || adWatchedToday || restoring || adCooldown || adLoading || !adServiceReady || isPreloadingRef.current} 
              variant={adWatchedToday ? "outline" : "default"}
              className={`w-full h-10 transition-all duration-300 ${
                adWatchedToday 
                  ? 'border-green-500/30 opacity-75 cursor-not-allowed' 
                  : adSessionActive 
                    ? 'bg-accent/50 cursor-wait'
                    : !adServiceReady || isPreloadingRef.current || !adWatchedLoaded
                      ? 'bg-muted cursor-wait'
                      : 'bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 shadow-lg shadow-accent/20'
              }`}
            >
              {!adWatchedLoaded ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading State...
                </>
              ) : !adServiceReady ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Initializing...
                </>
              ) : isPreloadingRef.current ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing Ad...
                </>
              ) : adLoading || adSessionActive ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading Ad...
                </>
              ) : adCooldown ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Please wait...
                </>
              ) : adWatchedToday ? (
                <>
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                  Reward Claimed — Come back tomorrow!
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Watch Ad — Get +1 Credit
                </>
              )}
            </Button>
            
            {adCooldown && !adWatchedToday && (
              <p className="text-[10px] text-center text-muted-foreground mt-2">
                ⏳ Please wait a moment...
              </p>
            )}
          </div>

          {/* ACTION CREDITS */}
          <div className="p-4 rounded-xl bg-secondary/50 border border-accent/20">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-base">Action Credits</p>
                  <span className="text-xl font-bold text-accent">{PRODUCT_PRICES.ACTION_CREDITS_10}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">10 Action</p>
              </div>
            </div>
            <ul className="space-y-1 mb-3">
              <li className="text-xs flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent" /><strong>Shield</strong> — Block a command</li>
              <li className="text-xs flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent" /><strong>Friendly Fire</strong> — Forward command to random same/lower rank</li>
              <li className="text-xs flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent" /><strong>Power Trip</strong> — Forward to lowest rank</li>
              <li className="text-xs flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent" /><strong>Stray Bullet</strong> — Spin the Wheel for command</li>
            </ul>
            <Button variant="serve" className="w-full h-11" onClick={() => { playButtonSound(); if (Capacitor.isNativePlatform()) handlePurchase("actions"); else setShowPayment("actions"); }} disabled={processing || purchaseLoading || restoring}>
              {(processing && selectedProduct === "actions") || (purchaseLoading && selectedProduct === "actions") ? (<Loader2 className="w-4 h-4 mr-2 animate-spin" />) : (<Zap className="w-4 h-4 mr-2" />)}
              {(processing && selectedProduct === "actions") || (purchaseLoading && selectedProduct === "actions") ? "Processing..." : `Buy 10 Actions • ${PRODUCT_PRICES.ACTION_CREDITS_10}`}
            </Button>
          </div>

          {/* SUPER ACTION CREDITS */}
          <div className="p-4 rounded-xl bg-secondary/50 border" style={{ borderColor: "hsl(270 80% 60% / 0.3)" }}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "hsl(270 80% 60% / 0.15)" }}>
                <Star className="w-6 h-6" style={{ color: "hsl(270 80% 60%)" }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-base">Super Action Credits</p>
                  <span className="text-xl font-bold" style={{ color: "hsl(270 80% 60%)" }}>{PRODUCT_PRICES.SUPER_CREDITS_6}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">6 Super Action Credits</p>
              </div>
            </div>
            <ul className="space-y-1 mb-3">
              <li className="text-xs flex items-center gap-2"><Star className="w-3.5 h-3.5" style={{ color: "hsl(270 80% 60%)" }} /><strong>Coup D'état</strong> — Steal command & become Captain</li>
              <li className="text-xs flex items-center gap-2"><Star className="w-3.5 h-3.5" style={{ color: "hsl(270 80% 60%)" }} /><strong>Rank Lottery</strong> — Swap ranks & strikes with random member</li>
              <li className="text-xs flex items-center gap-2"><Star className="w-3.5 h-3.5" style={{ color: "hsl(270 80% 60%)" }} /><strong>Saboteur</strong> — Set all live commands to 2 minutes</li>
            </ul>
            <Button className="w-full h-11 font-bold" style={{ background: "hsl(270 80% 60%)", color: "white" }} onClick={() => { playButtonSound(); if (Capacitor.isNativePlatform()) handlePurchase("super_actions"); else setShowPayment("super_actions"); }} disabled={processing || purchaseLoading || restoring}>
              {(processing && selectedProduct === "super_actions") || (purchaseLoading && selectedProduct === "super_actions") ? (<Loader2 className="w-4 h-4 mr-2 animate-spin" />) : (<Star className="w-4 h-4 mr-2" />)}
              {(processing && selectedProduct === "super_actions") || (purchaseLoading && selectedProduct === "super_actions") ? "Processing..." : `Buy 6 Super Actions • ${PRODUCT_PRICES.SUPER_CREDITS_6}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShopDialog;