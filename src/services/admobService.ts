import { Capacitor } from "@capacitor/core";
import { AdMob } from "@capacitor-community/admob";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdRewardType = "action_credit" | "extra_spin";

type DailyRewardState = {
  lastClaimDate: string;
  count: number;
  transactionIds: string[];
};

type ListenerMap = Map<string, Set<Function>>;

interface AdRewardResponse {
  success: boolean;
  credits_awarded?: number;
  credit_type?: string;
  watched_today?: number;
  remaining?: number;
  max_per_day?: number;
  error?: string;
}

interface PendingPromise {
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
  timeout: NodeJS.Timeout;
  createdAt: number;
  resolved: boolean;
}

interface AdSession {
  id: number;
  type: AdRewardType;
  transactionId: string;
  startTime: number;
}

const getEnvVar = (key: string): string => import.meta.env[key] || "";

const getAdUnits = () => ({
  action_credit: {
    android: getEnvVar("VITE_ADMOB_ACTION_CREDIT_ANDROID"),
    ios: getEnvVar("VITE_ADMOB_ACTION_CREDIT_IOS"),
  },
  extra_spin: {
    android: getEnvVar("VITE_ADMOB_EXTRA_SPIN_ANDROID"),
    ios: getEnvVar("VITE_ADMOB_EXTRA_SPIN_IOS"),
  },
});

class AdMobService {
  private static instance: AdMobService;

  private initialized = false;
  private listenersInitialized = false;
  private isProduction = import.meta.env.PROD;
  private currentUserId: string | null = null;
  private supabase: SupabaseClient | null = null;

  private rewardListeners: ListenerMap = new Map();
  private errorListeners: ListenerMap = new Map();
  private verificationListeners: ListenerMap = new Map();
  private stateChangeListeners: Set<(state: any) => void> = new Set();

  private currentSession: AdSession | null = null;
  private isShowingAd = false;
  private isAdLoading = false;
  private rewardGranted = false;
  private adCompleted = false;

  private pendingPromises: Map<string, PendingPromise> = new Map();
  private globalListeners: Array<{ remove: () => void }> = [];
  
  private errorCounts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private sessionCounter = 0;

  private dailyRewards: Record<AdRewardType, DailyRewardState> = {
    action_credit: {
      lastClaimDate: "",
      count: 0,
      transactionIds: [],
    },
    extra_spin: {
      lastClaimDate: "",
      count: 0,
      transactionIds: [],
    },
  };

  private readonly AD_TIMEOUT_MS = 120000;

  static getInstance(): AdMobService {
    if (!this.instance) {
      this.instance = new AdMobService();
    }
    return this.instance;
  }

  setSupabase(client: SupabaseClient) {
    this.supabase = client;
    console.log("[AdMob] Supabase client set");
  }

  private generateTransactionId(): string {
    return `admob_${this.currentUserId || 'anonymous'}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getPlatform(): "android" | "ios" {
    return Capacitor.getPlatform() === "ios" ? "ios" : "android";
  }

  private getToday(): string {
    return new Date().toDateString();
  }

  private logInfo(message: string, data?: any) {
    if (data) {
      console.log(`[AdMob] ${message}`, data);
    } else {
      console.log(`[AdMob] ${message}`);
    }
  }

  private logError(message: string, error?: any) {
    if (error) {
      console.error(`[AdMob ERROR] ${message}`, error);
    } else {
      console.error(`[AdMob ERROR] ${message}`);
    }
    
    const errorKey = message.split(" - ")[0];
    const count = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, count + 1);
    this.lastErrorTime.set(errorKey, Date.now());
  }

  private logWarn(message: string, data?: any) {
    if (data) {
      console.warn(`[AdMob WARN] ${message}`, data);
    } else {
      console.warn(`[AdMob WARN] ${message}`);
    }
  }

  private loadLocalCache() {
    try {
      const saved = localStorage.getItem("admob_daily_rewards");
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = this.getToday();
        
        if (parsed.action_credit?.lastClaimDate === today) {
          this.dailyRewards.action_credit.count = parsed.action_credit.count;
        }
        if (parsed.extra_spin?.lastClaimDate === today) {
          this.dailyRewards.extra_spin.count = parsed.extra_spin.count;
        }
      }
    } catch (err) {
      this.logError("Failed to load local cache", err);
    }
  }

  private saveLocalCache() {
    try {
      const cacheToStore = {
        action_credit: {
          lastClaimDate: this.dailyRewards.action_credit.lastClaimDate,
          count: this.dailyRewards.action_credit.count,
        },
        extra_spin: {
          lastClaimDate: this.dailyRewards.extra_spin.lastClaimDate,
          count: this.dailyRewards.extra_spin.count,
        },
      };
      localStorage.setItem("admob_daily_rewards", JSON.stringify(cacheToStore));
    } catch (err) {
      this.logError("Failed to save local cache", err);
    }
  }

  private resetIfNewDay(type: AdRewardType) {
    const today = this.getToday();
    if (this.dailyRewards[type].lastClaimDate !== today) {
      this.dailyRewards[type] = {
        lastClaimDate: today,
        count: 0,
        transactionIds: [],
      };
    }
  }

  async setUser(userId: string | null) {
    this.logInfo(`Setting user: ${userId || 'null'}`);
    this.currentUserId = userId;
    if (userId) {
      this.loadLocalCache();
      await this.syncFromBackend();
    } else {
      this.dailyRewards = {
        action_credit: {
          lastClaimDate: "",
          count: 0,
          transactionIds: [],
        },
        extra_spin: {
          lastClaimDate: "",
          count: 0,
          transactionIds: [],
        },
      };
    }
  }

  private async syncFromBackend() {
    if (!this.currentUserId || !this.supabase) {
      this.logWarn("Cannot sync from backend: missing user or supabase");
      return;
    }

    this.logInfo("Syncing from backend...");
    try {
      const { data: actionData, error: actionError } = await this.supabase
        .rpc('can_watch_ad', { _credit_type: 'action_credit' });
      
      if (!actionError && actionData) {
        const today = this.getToday();
        this.dailyRewards.action_credit = {
          lastClaimDate: today,
          count: actionData.watched_today || 0,
          transactionIds: this.dailyRewards.action_credit.transactionIds,
        };
      } else if (actionError) {
        this.logError("Failed to sync action_credit", actionError);
      }

      const { data: extraData, error: extraError } = await this.supabase
        .rpc('can_watch_ad', { _credit_type: 'extra_spin' });
      
      if (!extraError && extraData) {
        const today = this.getToday();
        this.dailyRewards.extra_spin = {
          lastClaimDate: today,
          count: extraData.watched_today || 0,
          transactionIds: this.dailyRewards.extra_spin.transactionIds,
        };
      } else if (extraError) {
        this.logError("Failed to sync extra_spin", extraError);
      }

      this.saveLocalCache();
    } catch (err) {
      this.logError("Failed to sync from backend", err);
    }
  }

  async canWatchAd(type: AdRewardType): Promise<boolean> {
    if (!this.currentUserId) {
      this.logWarn(`Cannot watch ad (${type}): no user set`);
      return false;
    }

    this.resetIfNewDay(type);
  
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .rpc('can_watch_ad', { _credit_type: type });

        if (error) throw error;

        let result: any = data;
        // supabase rpc may return JSONB as a string in some runtimes; try to parse
        if (typeof result === 'string') {
          try {
            result = JSON.parse(result);
          } catch (e) {
            this.logWarn('can_watch_ad returned string but JSON.parse failed', e);
          }
        }

        const watched_today = Number(result?.watched_today ?? this.dailyRewards[type].count ?? 0);
        const can_watch = !!result?.can_watch || watched_today < (result?.max_per_day ?? 3);

        this.dailyRewards[type].count = watched_today;
        if (!this.dailyRewards[type].lastClaimDate) this.dailyRewards[type].lastClaimDate = this.getToday();
        this.saveLocalCache();

        return can_watch;
      } catch (err) {
        // If the RPC doesn't exist or fails, fall back to a local-day-limited check
        this.logWarn(`can_watch_ad RPC failed for ${type}, falling back to local check`, err);
        const DEFAULT_MAX_PER_DAY = 3;
        const watched = this.dailyRewards[type].count || 0;
        const can = watched < DEFAULT_MAX_PER_DAY;
        return can;
      }
    }
    
    return false;
  }

  async getRemainingAds(type: AdRewardType): Promise<number> {
    if (!this.currentUserId || !this.supabase) return 0;

    try {
      const { data, error } = await this.supabase
        .rpc('can_watch_ad', { _credit_type: type });

      if (error) throw error;

      let result: any = data;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch (e) { /* ignore */ }
      }

      const remaining = Number(result?.remaining ?? 0);
      return remaining;
    } catch (err) {
      this.logWarn(`can_watch_ad RPC failed for remaining count for ${type}`, err);
      const DEFAULT_MAX_PER_DAY = 3;
      const watched = this.dailyRewards[type].count || 0;
      return Math.max(0, DEFAULT_MAX_PER_DAY - watched);
    }
  }

  async getRemainingDailyRewards(type: AdRewardType): Promise<number> {
    return this.getRemainingAds(type);
  }

  private async verifyAndAwardReward(
    type: AdRewardType,
    transactionId: string
  ): Promise<AdRewardResponse> {
    if (!this.supabase) {
      this.logError("Supabase not initialized for reward verification");
      return { success: false, error: "Supabase not initialized" };
    }

    this.logInfo(`Verifying and awarding reward`, { type, transactionId });

    try {
      // Call the server-side award_ad_credit RPC with both args. Migration
      // returns JSONB with { success, credits_awarded, watched_today, remaining }
      const { data, error } = await this.supabase.rpc('award_ad_credit' as any, {
        _credit_type: type,
        _transaction_id: transactionId,
      });

      if (error) throw error;

      let result: any = data;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch (e) { /* ignore */ }
      }

      if (result && result.success) {
        const today = this.getToday();
        const watched = Number(result.watched_today ?? (this.dailyRewards[type].count || 0) + 1);
        this.dailyRewards[type] = {
          lastClaimDate: today,
          count: watched,
          transactionIds: [...this.dailyRewards[type].transactionIds, transactionId],
        };
        this.saveLocalCache();

        return {
          success: true,
          credits_awarded: Number(result.credits_awarded ?? (type === 'action_credit' ? 1 : 0)),
          credit_type: type,
          watched_today: watched,
          remaining: Number(result.remaining ?? Math.max(0, 5 - watched)),
          max_per_day: Number(result.max_per_day ?? 5),
        };
      }

      const errMsg = (result && result.error) ? String(result.error) : 'Reward RPC failed';
      this.logError(`Reward RPC returned failure for ${type}`, result);
      return { success: false, error: errMsg };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify reward';
      this.logError(`Failed to award reward for ${type}`, err);
      return { success: false, error: errorMessage };
    }
  }

  private getAdUnit(type: AdRewardType): string {
    const platform = this.getPlatform();
    const adUnit = getAdUnits()[type][platform];

    if (!adUnit && this.isProduction) {
      const error = `Missing Ad Unit for ${type} on ${platform}`;
      this.logError(error);
      throw new Error(error);
    }

    return adUnit;
  }

  private resetAdState() {
    this.currentSession = null;
    this.rewardGranted = false;
    this.adCompleted = false;
    this.isShowingAd = false;
    this.isAdLoading = false;
    
    this.emitStateChange();
  }

  private emitStateChange() {
    const state = {
      isShowingAd: this.isShowingAd,
      isAdLoading: this.isAdLoading,
      currentSession: this.currentSession,
      rewardGranted: this.rewardGranted
    };
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(state);
      } catch (err) {
        this.logError("Error in state change listener", err);
      }
    });
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logInfo(`Initializing AdMob (${this.isProduction ? 'PRODUCTION' : 'TESTING'} mode)`);

    if (!Capacitor.isNativePlatform()) {
      this.logInfo("Web platform - AdMob disabled");
      this.initialized = true;
      return;
    }

    try {
      await AdMob.initialize({
        testingDevices: this.isProduction ? [] : ["EMULATOR"],
        initializeForTesting: !this.isProduction,
      });

      await this.setupGlobalListeners();

      this.initialized = true;
      this.listenersInitialized = true;

      this.logInfo(`✅ AdMob initialized successfully`);
    } catch (err) {
      this.logError("❌ AdMob initialize failed", err);
      throw err;
    }
  }

  private cleanupGlobalListeners() {
    this.logInfo(`Cleaning up ${this.globalListeners.length} global listeners`);
    this.globalListeners.forEach((listener) => {
      try {
        listener.remove();
      } catch (err) {
        this.logError("Error removing listener", err);
      }
    });
    this.globalListeners = [];
  }

  private async setupGlobalListeners() {
    if (this.listenersInitialized) {
      this.logWarn("Listeners already initialized, skipping");
      return;
    }

    this.cleanupGlobalListeners();
    this.logInfo("Setting up global AdMob listeners...");

    const loadedListener = await AdMob.addListener(
      "onRewardedVideoAdLoaded" as any,
      () => {
        this.logInfo("✅ Reward ad loaded");
        this.isAdLoading = false;
        this.emitStateChange();
      }
    );
    this.globalListeners.push(loadedListener);

    const rewardListener = await AdMob.addListener(
      "onRewardedVideoAdReward" as any,
      async (reward: any) => {
        const session = this.currentSession;
        
        this.logInfo("🔥 REWARD EVENT RECEIVED", { 
          reward, 
          sessionId: session?.id,
          rewardGranted: this.rewardGranted
        });

        if (!session) {
          this.logError("No active session for reward event");
          return;
        }

        if (this.rewardGranted) {
          this.logWarn("Reward already granted for this session");
          return;
        }

        if (session.id !== this.currentSession?.id) {
          this.logWarn("Session ID mismatch", {
            eventSession: session.id,
            currentSession: this.currentSession?.id
          });
          return;
        }

        this.rewardGranted = true;
        this.adCompleted = true;
        this.emitStateChange();

        const verification = await this.verifyAndAwardReward(session.type, session.transactionId);

        const pendingKey = `${session.type}_${session.id}`;
        const pending = this.pendingPromises.get(pendingKey);

        if (verification.success) {
          this.logInfo(`✅ Reward verified successfully`);
          
          if (pending && !pending.resolved) {
            pending.resolved = true;
            clearTimeout(pending.timeout);
            this.pendingPromises.delete(pendingKey);
            pending.resolve(true);
          }
          
          this.emitReward(session.type, verification);
          this.emitVerification(session.type, { success: true, data: verification });
        } else {
          this.logError("❌ Reward verification failed", { error: verification.error });
          
          if (pending && !pending.resolved) {
            pending.resolved = true;
            clearTimeout(pending.timeout);
            this.pendingPromises.delete(pendingKey);
            pending.reject(new Error(verification.error || "Reward verification failed"));
          }
          
          this.emitError(session.type, verification.error || "Reward verification failed");
          this.emitVerification(session.type, { success: false, error: verification.error });
        }
      }
    );
    this.globalListeners.push(rewardListener);

    const dismissListener = await AdMob.addListener(
      "onRewardedVideoAdDismissed" as any,
      () => {
        const session = this.currentSession;
        this.logInfo("🚪 Ad dismissed/closed", { 
          sessionId: session?.id, 
          rewardGranted: this.rewardGranted
        });

        // Check if reward was granted before dismissal
        if (!this.rewardGranted && this.currentSession) {
          const pendingKey = `${this.currentSession.type}_${this.currentSession.id}`;
          const pending = this.pendingPromises.get(pendingKey);
          
          if (pending && !pending.resolved) {
            this.logError("❌ Ad dismissed without reward");
            pending.resolved = true;
            clearTimeout(pending.timeout);
            pending.reject(new Error("Ad dismissed without reward"));
            this.pendingPromises.delete(pendingKey);
            this.emitError(this.currentSession.type, "Ad dismissed without reward");
          }
        }
        
        // Don't reset immediately - give reward event time to fire
        setTimeout(() => {
          this.resetAdState();
        }, 2000);
      }
    );
    this.globalListeners.push(dismissListener);

    const failLoadListener = await AdMob.addListener(
      "onRewardedVideoAdFailedToLoad" as any,
      (err: any) => {
        this.logError("⚠️ Ad failed to load", err);
        this.isAdLoading = false;
        
        if (this.currentSession) {
          const session = this.currentSession;
          const pendingKey = `${session.type}_${session.id}`;
          const pending = this.pendingPromises.get(pendingKey);
          
          if (pending && !pending.resolved && !this.rewardGranted) {
            this.logError(`Rejecting pending promise due to load failure`);
            pending.resolved = true;
            clearTimeout(pending.timeout);
            pending.reject(new Error("Ad failed to load"));
            this.pendingPromises.delete(pendingKey);
            this.emitError(session.type, "Ad failed to load");
          }
        }
        
        this.resetAdState();
        this.emitStateChange();
      }
    );
    this.globalListeners.push(failLoadListener);

    const failShowListener = await AdMob.addListener(
      "onRewardedVideoAdFailedToShow" as any,
      (err: any) => {
        this.logError("❌ Ad failed to show", err);
        
        if (this.currentSession) {
          const session = this.currentSession;
          const pendingKey = `${session.type}_${session.id}`;
          const pending = this.pendingPromises.get(pendingKey);
          
          if (pending && !pending.resolved) {
            pending.resolved = true;
            clearTimeout(pending.timeout);
            pending.reject(new Error("Failed to show ad"));
            this.pendingPromises.delete(pendingKey);
          }
          
          this.emitError(session.type, "Failed to show ad");
        }
        
        this.resetAdState();
        this.emitStateChange();
      }
    );
    this.globalListeners.push(failShowListener);

    const showListener = await AdMob.addListener(
      "onRewardedVideoAdShowed" as any,
      () => {
        this.logInfo("🎬 Rewarded ad showed successfully");
        this.isShowingAd = true;
        this.isAdLoading = false;
        this.emitStateChange();
      }
    );
    this.globalListeners.push(showListener);

    this.listenersInitialized = true;
    this.logInfo("✅ All AdMob listeners registered successfully");
  }

  onReward(type: AdRewardType, callback: (data?: any) => void) {
    if (!this.rewardListeners.has(type)) {
      this.rewardListeners.set(type, new Set());
    }
    this.rewardListeners.get(type)!.add(callback);
    
    return () => {
      this.rewardListeners.get(type)?.delete(callback);
    };
  }

  onError(type: AdRewardType, callback: (message: string) => void) {
    if (!this.errorListeners.has(type)) {
      this.errorListeners.set(type, new Set());
    }
    this.errorListeners.get(type)!.add(callback);
    
    return () => {
      this.errorListeners.get(type)?.delete(callback);
    };
  }

  onVerification(type: AdRewardType, callback: (result: any) => void) {
    if (!this.verificationListeners.has(type)) {
      this.verificationListeners.set(type, new Set());
    }
    this.verificationListeners.get(type)!.add(callback);
    
    return () => {
      this.verificationListeners.get(type)?.delete(callback);
    };
  }

  onStateChange(callback: (state: any) => void) {
    this.stateChangeListeners.add(callback);
    
    return () => {
      this.stateChangeListeners.delete(callback);
    };
  }

  private emitReward(type: AdRewardType, data?: any) {
    this.logInfo(`📢 Emitting reward event for ${type}`, data);
    const listeners = this.rewardListeners.get(type);
    if (!listeners || listeners.size === 0) {
      this.logWarn(`No reward listeners found for ${type}`);
      return;
    }
    
    listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        this.logError(`Error in reward callback for ${type}`, err);
      }
    });
  }

  private emitError(type: AdRewardType, message: string) {
    this.logError(`📢 Emitting error for ${type}: ${message}`);
    const listeners = this.errorListeners.get(type);
    if (!listeners || listeners.size === 0) {
      this.logWarn(`No error listeners found for ${type}`);
      return;
    }
    
    listeners.forEach((cb) => {
      try {
        cb(message);
      } catch (err) {
        this.logError(`Error in error callback for ${type}`, err);
      }
    });
  }

  private emitVerification(type: AdRewardType, result: any) {
    this.logInfo(`📢 Emitting verification for ${type}`, result);
    const listeners = this.verificationListeners.get(type);
    if (!listeners || listeners.size === 0) {
      this.logWarn(`No verification listeners found for ${type}`);
      return;
    }
    
    listeners.forEach((cb) => {
      try {
        cb(result);
      } catch (err) {
        this.logError(`Error in verification callback for ${type}`, err);
      }
    });
  }

  async showRewardedAd(type: AdRewardType): Promise<boolean> {
    const startTime = Date.now();
    this.logInfo(`🎬 Starting showRewardedAd for ${type}`);
    
    if (!this.currentUserId) {
      this.logError(`Cannot show ad: user not authenticated`);
      this.emitError(type, "User not authenticated");
      return false;
    }

    if (this.isShowingAd) {
      this.logWarn(`Ad already showing - rejecting request for ${type}`);
      this.emitError(type, "Ad already showing");
      return false;
    }

    if (this.isAdLoading) {
      this.logWarn(`Ad already loading - rejecting request for ${type}`);
      this.emitError(type, "Ad already loading");
      return false;
    }

    const canWatch = await this.canWatchAd(type);
    if (!canWatch) {
      const remaining = await this.getRemainingAds(type);
      this.logWarn(`Cannot watch ad - daily limit reached for ${type}`, { remaining });
      this.emitError(type, `Daily limit reached (${remaining} remaining)`);
      return false;
    }

    await this.initialize();

    if (!Capacitor.isNativePlatform()) {
      this.logError("Cannot show ad on web platform");
      this.emitError(type, "Ads unavailable on web");
      return false;
    }

    // Create new session
    this.sessionCounter++;
    const sessionId = this.sessionCounter;
    const transactionId = this.generateTransactionId();
    
    this.currentSession = {
      id: sessionId,
      type: type,
      transactionId: transactionId,
      startTime: startTime
    };
    
    this.rewardGranted = false;
    this.adCompleted = false;
    this.isShowingAd = false;
    this.isAdLoading = true;
    this.emitStateChange();

    this.logInfo(`🎬 Created ad session ${sessionId} for ${type}`, { transactionId });

    const adPromise = new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pendingKey = `${type}_${sessionId}`;
        const pending = this.pendingPromises.get(pendingKey);
        if (pending && !pending.resolved) {
          this.logError(`Ad reward timeout (${this.AD_TIMEOUT_MS/1000}s) for session ${sessionId}`);
          pending.resolved = true;
          this.pendingPromises.delete(pendingKey);
          reject(new Error(`Ad reward timeout (${this.AD_TIMEOUT_MS/1000}s)`));
          this.emitError(type, `Ad reward timeout`);
        }
      }, this.AD_TIMEOUT_MS);
      
      this.pendingPromises.set(`${type}_${sessionId}`, { 
        resolve, 
        reject, 
        timeout,
        createdAt: Date.now(),
        resolved: false
      });
    });

    try {
      const adId = this.getAdUnit(type);
      this.logInfo(`Loading rewarded ad for ${type}`, { adId, sessionId });

      await AdMob.prepareRewardVideoAd({
        adId,
        isTesting: !this.isProduction,
      });

      if (sessionId !== this.currentSession?.id) {
        this.logWarn(`Session expired during load: ${sessionId} vs ${this.currentSession?.id}`);
        const pendingKey = `${type}_${sessionId}`;
        const pending = this.pendingPromises.get(pendingKey);
        if (pending && !pending.resolved) {
          pending.resolved = true;
          clearTimeout(pending.timeout);
          this.pendingPromises.delete(pendingKey);
          pending.reject(new Error("Session expired"));
        }
        this.resetAdState();
        return false;
      }

      this.isAdLoading = false;
      this.logInfo(`Ad prepared successfully for session ${sessionId}, showing now...`);

      await AdMob.showRewardVideoAd();
      
      const loadTime = Date.now() - startTime;
      this.logInfo(`✅ Ad shown for session ${sessionId}`, { loadTime: `${loadTime}ms` });
      
      const result = await adPromise;
      const totalTime = Date.now() - startTime;
      this.logInfo(`✅ Ad completed successfully for session ${sessionId}`, { totalTime: `${totalTime}ms` });
      
      return result;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown ad error";
      this.logError(`Ad error for session ${sessionId}`, { error: errorMessage, err });
      
      if (sessionId === this.currentSession?.id) {
        this.emitError(type, errorMessage);
        this.resetAdState();
      }
      
      const pendingKey = `${type}_${sessionId}`;
      const pending = this.pendingPromises.get(pendingKey);
      if (pending && !pending.resolved) {
        pending.resolved = true;
        clearTimeout(pending.timeout);
        this.pendingPromises.delete(pendingKey);
      }
      
      return false;
    } finally {
      this.isAdLoading = false;
      this.emitStateChange();
    }
  }

  async preloadRewardedAd(type: AdRewardType): Promise<boolean> {
    const startTime = Date.now();
    this.logInfo(`🎬 Preloading ad for ${type}`);
    
    if (this.isShowingAd || this.isAdLoading) {
      this.logWarn(`Cannot preload - ad already showing or loading for ${type}`);
      return false;
    }

    const canWatch = await this.canWatchAd(type);
    if (!canWatch) {
      this.logWarn(`Cannot preload - daily limit reached for ${type}`);
      return false;
    }

    try {
      await this.initialize();

      if (!Capacitor.isNativePlatform()) {
        this.logWarn("Cannot preload on web platform");
        return false;
      }

      this.isAdLoading = true;
      this.emitStateChange();
      
      await AdMob.prepareRewardVideoAd({
        adId: this.getAdUnit(type),
        isTesting: !this.isProduction,
      });
      
      const loadTime = Date.now() - startTime;
      this.logInfo(`✅ Ad preloaded successfully for ${type}`, { loadTime: `${loadTime}ms` });
      return true;
    } catch (err) {
      this.logError(`Failed to preload ad for ${type}`, err);
      return false;
    } finally {
      this.isAdLoading = false;
      this.emitStateChange();
    }
  }

  getErrorStats() {
    const stats = {
      errorCounts: Object.fromEntries(this.errorCounts),
      lastErrorTime: Object.fromEntries(this.lastErrorTime),
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0)
    };
    return stats;
  }

  getCurrentState() {
    return {
      initialized: this.initialized,
      listenersInitialized: this.listenersInitialized,
      isShowingAd: this.isShowingAd,
      isAdLoading: this.isAdLoading,
      currentSession: this.currentSession,
      rewardGranted: this.rewardGranted,
      isProduction: this.isProduction,
      platform: this.getPlatform(),
      hasUser: !!this.currentUserId
    };
  }

  async cleanup() {
    this.logInfo("Starting cleanup...");
    
    const pendingCount = this.pendingPromises.size;
    this.pendingPromises.forEach((pending, key) => {
      if (!pending.resolved) {
        pending.resolved = true;
        clearTimeout(pending.timeout);
        pending.reject(new Error("Service cleanup"));
      }
      this.pendingPromises.delete(key);
    });
    this.logInfo(`Cleaned up ${pendingCount} pending promises`);
    
    this.cleanupGlobalListeners();
    this.resetAdState();
    this.initialized = false;
    this.listenersInitialized = false;
    
    this.logInfo("✅ AdMob service cleaned up");
  }
}

export const admobService = AdMobService.getInstance();