import { useState, useEffect, useCallback, useRef } from 'react';
import { admobService, AdRewardType } from '@/services/admobService';

interface AdRewardState {
  canWatchActionCredit: boolean;
  canWatchExtraSpin: boolean;
  remainingActionCredit: number;
  remainingExtraSpin: number;
  watchingAd: AdRewardType | null;
  isLoading: boolean;
  error: string | null;
}

export function useAdRewards() {
  const [state, setState] = useState<AdRewardState>({
    canWatchActionCredit: false,
    canWatchExtraSpin: false,
    remainingActionCredit: 0,
    remainingExtraSpin: 0,
    watchingAd: null,
    isLoading: true,
    error: null,
  });
  
  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const refreshState = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const [canWatchActionCredit, canWatchExtraSpin, remainingActionCredit, remainingExtraSpin] = await Promise.all([
        admobService.canWatchAd('action_credit'),
        admobService.canWatchAd('extra_spin'),
        admobService.getRemainingDailyRewards('action_credit'),
        admobService.getRemainingDailyRewards('extra_spin'),
      ]);

      if (!mountedRef.current) return;

      setState(prev => ({
        ...prev,
        canWatchActionCredit,
        canWatchExtraSpin,
        remainingActionCredit,
        remainingExtraSpin,
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh ad state';
      console.error('Failed to refresh ad state:', errorMessage);
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, []);

  const initialize = useCallback(async () => {
    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    initPromiseRef.current = (async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        await admobService.initialize();
        
        if (mountedRef.current) {
          refreshState();
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Failed to initialize AdMob:', error);
        if (mountedRef.current) {
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Failed to initialize ads' 
          }));
        }
      } finally {
        initPromiseRef.current = null;
      }
    })();

    return initPromiseRef.current;
  }, [refreshState]);

  useEffect(() => {
    mountedRef.current = true;
    
    initialize();

    // Midnight reset listener
    const scheduleMidnightReset = () => {
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0, 0
      );
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      const timeoutId = setTimeout(() => {
        if (mountedRef.current) {
          refreshState();
          scheduleMidnightReset();
        }
      }, msUntilMidnight);
      
      return () => clearTimeout(timeoutId);
    };

    const cleanupMidnight = scheduleMidnightReset();

    return () => {
      mountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      cleanupMidnight();
    };
  }, [initialize, refreshState]);

  const watchAdForActionCredit = useCallback(async (): Promise<boolean> => {
    if (state.watchingAd) {
      console.log('Ad already playing');
      return false;
    }

    const canWatch = await admobService.canWatchAd('action_credit');
    if (!canWatch) {
      setState(prev => ({ ...prev, error: 'Daily limit reached for action credits' }));
      return false;
    }

    setState(prev => ({ ...prev, watchingAd: 'action_credit', error: null }));
    
    try {
      const success = await admobService.showRewardedAd('action_credit');
      if (success) {
        await refreshState();
        return true;
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to watch ad';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    } finally {
      if (mountedRef.current) {
        setState(prev => ({ ...prev, watchingAd: null }));
      }
    }
  }, [state.watchingAd, refreshState]);

  const watchAdForExtraSpin = useCallback(async (): Promise<boolean> => {
    if (state.watchingAd) {
      console.log('Ad already playing');
      return false;
    }

    const canWatch = await admobService.canWatchAd('extra_spin');
    if (!canWatch) {
      setState(prev => ({ ...prev, error: 'Daily limit reached for extra spins' }));
      return false;
    }

    setState(prev => ({ ...prev, watchingAd: 'extra_spin', error: null }));
    
    try {
      const success = await admobService.showRewardedAd('extra_spin');
      if (success) {
        await refreshState();
        return true;
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to watch ad';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    } finally {
      if (mountedRef.current) {
        setState(prev => ({ ...prev, watchingAd: null }));
      }
    }
  }, [state.watchingAd, refreshState]);

  return {
    canWatchActionCredit: state.canWatchActionCredit,
    canWatchExtraSpin: state.canWatchExtraSpin,
    remainingActionCredit: state.remainingActionCredit,
    remainingExtraSpin: state.remainingExtraSpin,
    watchingAd: state.watchingAd,
    watchAdForActionCredit,
    watchAdForExtraSpin,
    refresh: refreshState,
    isLoading: state.isLoading,
    error: state.error,
  };
}