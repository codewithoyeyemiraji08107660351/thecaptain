// contexts/PurchaseContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { revenuecatService, PREMIUM_ENTITLEMENT_ID, PackageType } from '@/services/revenuecatService';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

interface PurchaseContextType {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: (type?: PackageType) => Promise<boolean>;
  purchaseProduct: (productId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshPremiumStatus: () => Promise<boolean>;
  getEntitlementInfo: () => Promise<{ 
    isActive: boolean; 
    productId?: string; 
    originalPurchaseDate?: Date;
  }>;
}

const PurchaseContext = createContext<PurchaseContextType | undefined>(undefined);

export const usePurchase = () => {
  const context = useContext(PurchaseContext);
  if (!context) {
    throw new Error('usePurchase must be used within PurchaseProvider');
  }
  return context;
};

export const PurchaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isRefreshingRef = useRef(false);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    const setup = async () => {
      if (!Capacitor.isNativePlatform()) {
        setIsLoading(false);
        return;
      }

      if (isInitializedRef.current) return;
      isInitializedRef.current = true;

      try {
        await revenuecatService.initialize(user?.id);
        await revenuecatService.loadOfferings();
        await refreshPremiumStatus();
      } catch (error) {
        console.error('Failed to initialize RevenueCat:', error);
      } finally {
        setIsLoading(false);
      }
    };

    setup();

    const cleanup = revenuecatService.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      const hasPremium = info.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive === true;
      setIsPremium(hasPremium);
    });
    
    return () => {
      cleanup();
      isInitializedRef.current = false;
    };
  }, [user?.id]);

  const refreshPremiumStatus = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) return isPremium;
    
    if (!Capacitor.isNativePlatform()) return false;
    
    isRefreshingRef.current = true;
    
    try {
      const premium = await revenuecatService.isPremium();
      setIsPremium(premium);
      return premium;
    } catch (error) {
      console.error('Failed to refresh premium status:', error);
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [isPremium]);

  const getEntitlementInfo = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      return { isActive: false };
    }
    return await revenuecatService.getEntitlementInfo();
  }, []);

  const purchasePremium = useCallback(async (type: PackageType = 'full_version'): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('Purchases are only available in the mobile app');
      return false;
    }
    
    if (!user?.id) {
      toast.error('Please log in to make purchases');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const result = await revenuecatService.purchasePackage(type);
      
      if (result.success) {
        await refreshPremiumStatus();
        toast.success(type === 'full_version' ? 'Full Version unlocked! 🎉' : 'Purchase successful! 🎉');
        return true;
      } else {
        if (result.errorCode === 'cancelled') {
          toast.info('Purchase was cancelled');
        } else {
          toast.error(result.error || 'Purchase failed');
        }
        return false;
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Purchase failed. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, refreshPremiumStatus]);

  const purchaseProduct = useCallback(async (productId: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('Purchases are only available in the mobile app');
      return false;
    }
    
    if (!user?.id) {
      toast.error('Please log in to make purchases');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const result = await revenuecatService.purchaseProduct(productId);
      
      if (result.success) {
        await refreshPremiumStatus();
        toast.success('Purchase successful! 🎉');
        return true;
      } else {
        if (result.errorCode === 'cancelled') {
          toast.info('Purchase was cancelled');
        } else {
          toast.error(result.error || 'Purchase failed');
        }
        return false;
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Purchase failed. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, refreshPremiumStatus]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('Restore purchases only available in the mobile app');
      return false;
    }
    
    if (!user?.id) {
      toast.error('Please log in to restore purchases');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const result = await revenuecatService.restorePurchases();
      
      if (result.success) {
        const isNowPremium = await refreshPremiumStatus();
        
        if (isNowPremium) {
          toast.success('Purchases restored successfully! 🎉');
        } else {
          toast.info('No premium purchases found');
        }
        
        return isNowPremium;
      } else {
        toast.error(result.error || 'No previous purchases found');
        return false;
      }
    } catch (error) {
      console.error('Restore error:', error);
      toast.error('Failed to restore purchases. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, refreshPremiumStatus]);

  return (
    <PurchaseContext.Provider value={{
      isPremium,
      isLoading,
      purchasePremium,
      purchaseProduct,
      restorePurchases,
      refreshPremiumStatus,
      getEntitlementInfo,
    }}>
      {children}
    </PurchaseContext.Provider>
  );
};