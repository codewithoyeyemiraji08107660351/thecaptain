import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Gift, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useAdRewards } from '@/hooks/useAdRewards';
import { cn } from '@/lib/utils';

interface AdRewardButtonProps {
  type: 'action_credit' | 'extra_spin';
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onRewardEarned?: () => void;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  showSuccessToast?: boolean;
}

const AD_CONFIG = {
  action_credit: {
    title: 'Watch Ad for +1 Action Credit',
    description: 'Get 1 free Action Credit',
    icon: Gift,
    buttonText: 'Watch Ad',
    loadingText: 'Loading Ad...',
    watchingText: 'Watching Ad...',
    maxDaily: 1,
    successMessage: '🎉 You earned 1 Action Credit!',
    color: 'from-yellow-500 to-orange-500',
  },
  extra_spin: {
    title: 'Watch Ad for Extra Spin',
    description: 'Get 1 extra Daily Spin',
    icon: RefreshCw,
    buttonText: 'Watch Ad',
    loadingText: 'Loading Ad...',
    watchingText: 'Watching Ad...',
    maxDaily: 1,
    successMessage: '🎉 You earned 1 Extra Spin!',
    color: 'from-blue-500 to-purple-500',
  },
};

export function AdRewardButton({ 
  type, 
  onSuccess, 
  onError,
  onRewardEarned,
  className, 
  size = 'default',
  showSuccessToast = true
}: AdRewardButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const {
    canWatchActionCredit,
    canWatchExtraSpin,
    remainingActionCredit,
    remainingExtraSpin,
    watchingAd,
    watchAdForActionCredit,
    watchAdForExtraSpin,
    refresh,
    isLoading: isAdMobLoading,
    error: globalError,
  } = useAdRewards();

  const canWatch = type === 'action_credit' ? canWatchActionCredit : canWatchExtraSpin;
  const remaining = type === 'action_credit' ? remainingActionCredit : remainingExtraSpin;
  const config = AD_CONFIG[type];
  const Icon = config.icon;
  const isLoading = watchingAd === type || (isAdMobLoading && !watchingAd);
  const isWatching = watchingAd === type;

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const handleWatchAd = async () => {
    if (!canWatch || isLoading) return;
    
    let success = false;
    
    try {
      if (type === 'action_credit') {
        success = await watchAdForActionCredit();
      } else {
        success = await watchAdForExtraSpin();
      }
      
      if (success) {
        // Show success message
        if (showSuccessToast) {
          setShowSuccess(true);
        }
        console.log(config.successMessage);
        
        // Trigger reward earned callback
        if (onRewardEarned) {
          onRewardEarned();
        }
        
        // Trigger success callback
        if (onSuccess) {
          onSuccess();
        }
        
        // Force refresh to update UI
        refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to watch ad. Please try again.';
      console.error('Ad error:', errorMessage);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  // Show loading state while AdMob is initializing
  if (isAdMobLoading && !watchingAd) {
    return (
      <div className="space-y-2 w-full">
        <Button
          disabled
          variant="outline"
          size={size}
          className={cn('w-full', className)}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Ads...
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 w-full">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{config.successMessage}</span>
          </div>
        </div>
      )}
      
      {/* Error Message */}
      {globalError && (
        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded-md animate-in fade-in duration-200">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>{globalError}</span>
        </div>
      )}
      
      <Button
        onClick={handleWatchAd}
        disabled={!canWatch || isLoading}
        variant={canWatch ? 'default' : 'outline'}
        size={size}
        className={cn(
          'relative overflow-hidden transition-all w-full font-semibold',
          canWatch && `bg-gradient-to-r ${config.color} hover:opacity-90 text-white shadow-lg hover:shadow-xl`,
          !canWatch && 'opacity-60 cursor-not-allowed',
          className
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isWatching ? config.watchingText : config.loadingText}
          </>
        ) : !canWatch ? (
          <>
            <span className="opacity-50">{config.buttonText}</span>
            <span className="ml-2 text-xs opacity-50">(Daily limit reached)</span>
          </>
        ) : (
          <>
            <Icon className="mr-2 h-4 w-4" />
            {config.buttonText}
            {remaining > 0 && (
              <span className="ml-2 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                {remaining} left today
              </span>
            )}
          </>
        )}
      </Button>
      
      {/* Info text for users */}
      {!canWatch && remaining === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground text-center animate-in fade-in">
          ✨ Come back tomorrow for more rewards!
        </p>
      )}
      
      {/* Accessibility description */}
      {canWatch && !isLoading && (
        <p className="text-xs text-muted-foreground text-center sr-only">
          Watch a short video ad to earn {config.description.toLowerCase()}
        </p>
      )}
    </div>
  );
}