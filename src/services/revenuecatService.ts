import { Capacitor } from '@capacitor/core';
import { Purchases, PurchasesConfiguration, LOG_LEVEL, CustomerInfo, PurchasesPackage } from '@revenuecat/purchases-capacitor';

const PREMIUM_ENTITLEMENT_ID = 'premium_access';

export type PackageType = 'full_version' | '10_actions' | '6_super_actions';

interface Product {
  identifier: string;
  title: string;
  description: string;
  price: number;
  priceString: string;
  currencyCode: string;
}

interface PackageInfo {
  package: PurchasesPackage;
  type: PackageType;
  product: Product;
}

const logger = {
  log: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  },
  error: (...args: any[]) => {
    console.error('[RevenueCat]', ...args);
  },
  warn: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.warn(...args);
    }
  },
};

const PRODUCT_MAP: Record<string, PackageType> = {
  'the_captain_full_version': 'full_version',
  '10_action_credits': '10_actions',
  '6_super_credits': '6_super_actions'
};

class RevenueCatService {
  private static instance: RevenueCatService;
  private initialized = false;
  private isProduction = import.meta.env.PROD;
  private customerInfo: CustomerInfo | null = null;
  private initPromise: Promise<void> | null = null;
  private currentUserId: string | null = null;
  private customerInfoCallbacks: ((customerInfo: CustomerInfo) => void)[] = [];
  private cachedPackages: Map<PackageType, PackageInfo> = new Map();
  private offeringsLoaded = false;
  private listenerAttached = false;
  private initRetryCount = 0;
  private readonly MAX_INIT_RETRIES = 3;

  static getInstance(): RevenueCatService {
    if (!RevenueCatService.instance) {
      RevenueCatService.instance = new RevenueCatService();
    }
    return RevenueCatService.instance;
  }

  private getApiKey(): string {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('RevenueCat only available on native platforms');
    }
    
    const platform = Capacitor.getPlatform();
    
    if (platform === 'android') {
      const key = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY;
      if (!key) throw new Error('Missing RevenueCat Android API key');
      return key;
    } else if (platform === 'ios') {
      const key = import.meta.env.VITE_REVENUECAT_IOS_API_KEY;
      if (!key) throw new Error('Missing RevenueCat iOS API key');
      return key;
    }
    
    throw new Error('Unsupported platform for RevenueCat');
  }

  async initialize(userId?: string | null): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      logger.log('Not on native platform, skipping RevenueCat init');
      return;
    }
    
    if (this.initialized && this.currentUserId === userId) {
      logger.log('RevenueCat already initialized for this user');
      return;
    }
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initializeWithRetry(userId);
    await this.initPromise;
  }

  private async initializeWithRetry(userId?: string | null): Promise<void> {
    try {
      await this._initialize(userId);
      this.initRetryCount = 0;
    } catch (error) {
      if (this.initRetryCount < this.MAX_INIT_RETRIES) {
        this.initRetryCount++;
        const delay = Math.pow(2, this.initRetryCount) * 1000;
        logger.log(`Retrying RevenueCat init in ${delay}ms (attempt ${this.initRetryCount})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initializeWithRetry(userId);
      }
      throw error;
    }
  }

  private async _initialize(userId?: string | null): Promise<void> {
    try {
      const apiKey = this.getApiKey();
      
      const configuration: PurchasesConfiguration = {
        apiKey: apiKey,
        appUserID: userId || null,
      };
      
      await Purchases.configure(configuration);
      
      await Purchases.setLogLevel({ 
        level: this.isProduction ? LOG_LEVEL.ERROR : LOG_LEVEL.DEBUG
      });
      
      this.setupCustomerInfoListener();
      
      if (userId) {
        const result = await Purchases.logIn({ appUserID: userId });
        this.customerInfo = result.customerInfo;
        this.currentUserId = userId;
        logger.log(`User logged in: ${userId.substring(0, 8)}... (${result.created ? 'new' : 'existing'})`);
      }
      
      await Purchases.syncPurchases();
      await this.refreshCustomerInfo();
      
      this.initialized = true;
      logger.log(`✅ RevenueCat initialized (${this.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);
      
    } catch (error) {
      logger.error('❌ RevenueCat initialization failed:', error);
      this.initialized = false;
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  private setupCustomerInfoListener(): void {
    if (this.listenerAttached) return;

    Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      this.customerInfo = info;
      this.customerInfoCallbacks.forEach(cb => cb(info));
      logger.log('Customer info updated via native listener');
    });

    this.listenerAttached = true;
  }

  async loadOfferings(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    
    if (!this.initialized) {
      logger.warn('Cannot load offerings: RevenueCat not initialized');
      return;
    }
    
    try {
      const offerings = await Purchases.getOfferings();
      
      if (!offerings.current) {
        logger.warn('No current offering available');
        return;
      }
      
      const allPackages = offerings.current.availablePackages || [];
      this.cachedPackages.clear();
      
      logger.log(`📦 Found ${allPackages.length} packages in offering`);
      
      for (const pkg of allPackages) {
        const identifier = pkg.product.identifier;
        logger.log(`Processing package: ${identifier} (${pkg.product.title})`);
        
        const type = PRODUCT_MAP[identifier];
        
        if (type) {
          this.cachedPackages.set(type, {
            package: pkg,
            type,
            product: {
              identifier: pkg.product.identifier,
              title: pkg.product.title,
              description: pkg.product.description,
              price: pkg.product.price,
              priceString: pkg.product.priceString,
              currencyCode: pkg.product.currencyCode,
            }
          });
          logger.log(`✅ Mapped ${identifier} -> ${type}, Price: ${pkg.product.priceString}`);
        } else {
          logger.warn(`⚠️ Unknown product identifier: ${identifier}`);
        }
      }
      
      this.offeringsLoaded = true;
      logger.log(`✅ Loaded ${this.cachedPackages.size} packages: ${Array.from(this.cachedPackages.keys()).join(', ')}`);
      
    } catch (error) {
      logger.error('Failed to load offerings:', error);
      this.offeringsLoaded = false;
    }
  }

  addCustomerInfoUpdateListener(callback: (customerInfo: CustomerInfo) => void): () => void {
    this.customerInfoCallbacks.push(callback);
    
    if (this.customerInfo) {
      callback(this.customerInfo);
    }
    
    return () => {
      const index = this.customerInfoCallbacks.indexOf(callback);
      if (index !== -1) this.customerInfoCallbacks.splice(index, 1);
    };
  }

  async setUserID(userId: string): Promise<void> {
    if (!userId) {
      logger.warn('Cannot set empty user ID');
      return;
    }
    
    if (!Capacitor.isNativePlatform()) return;
    
    if (this.initialized && this.currentUserId === userId) {
      logger.log('Already using this user ID');
      return;
    }
    
    if (this.initialized && this.currentUserId !== userId) {
      try {
        const result = await Purchases.logIn({ appUserID: userId });
        this.customerInfo = result.customerInfo;
        this.currentUserId = userId;
        
        await Purchases.syncPurchases();
        await this.loadOfferings();
        
        if (this.customerInfo) {
          this.customerInfoCallbacks.forEach(cb => cb(this.customerInfo!));
        }
        
        logger.log(`✅ RevenueCat user switched to: ${userId.substring(0, 8)}... (${result.created ? 'new' : 'existing'})`);
        return;
      } catch (error) {
        logger.error('❌ Failed to switch user:', error);
        throw error;
      }
    }
    
    if (!this.initialized) {
      await this.initialize(userId);
      return;
    }
  }

  async logout(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      await Purchases.logOut();
      this.customerInfo = null;
      this.currentUserId = null;
      this.offeringsLoaded = false;
      this.cachedPackages.clear();
      logger.log('✅ RevenueCat logout successful');
    } catch (error) {
      logger.error('❌ Logout failed:', error);
    }
  }

  async refreshCustomerInfo(): Promise<CustomerInfo | null> {
    if (!Capacitor.isNativePlatform()) return null;
    
    if (!this.initialized) {
      if (this.currentUserId) {
        await this.initialize(this.currentUserId);
      } else {
        return null;
      }
    }
    
    try {
      const result = await Purchases.getCustomerInfo();
      this.customerInfo = result.customerInfo;
      return this.customerInfo;
    } catch (error) {
      logger.error('❌ Failed to get customer info:', error);
      return this.customerInfo;
    }
  }

  async isPremium(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    
    try {
      const customerInfo = await this.refreshCustomerInfo();
      if (!customerInfo) return false;
      
      const entitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
      const hasPremium = entitlement?.isActive === true;
      
      return hasPremium;
    } catch (error) {
      logger.error('Failed to check premium status:', error);
      return false;
    }
  }

  async getEntitlementInfo(): Promise<{
    isActive: boolean;
    productId?: string;
    originalPurchaseDate?: Date;
  }> {
    if (!Capacitor.isNativePlatform()) return { isActive: false };
    
    try {
      const customerInfo = await this.refreshCustomerInfo();
      if (!customerInfo) return { isActive: false };
      
      const entitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
      
      if (!entitlement?.isActive) {
        return { isActive: false };
      }
      
      return {
        isActive: true,
        productId: entitlement.productIdentifier,
        originalPurchaseDate: entitlement.originalPurchaseDate ? new Date(entitlement.originalPurchaseDate) : undefined,
      };
    } catch (error) {
      logger.error('Failed to get entitlement info:', error);
      return { isActive: false };
    }
  }

  async getPackage(type: PackageType): Promise<PackageInfo | null> {
    if (!this.initialized) {
      logger.warn('RevenueCat not initialized');
      return null;
    }
    
    if (!this.offeringsLoaded) {
      await this.loadOfferings();
    }
    
    return this.cachedPackages.get(type) || null;
  }

  async getAllPackages(): Promise<PackageInfo[]> {
    if (!this.initialized) {
      logger.warn('RevenueCat not initialized');
      return [];
    }
    
    if (!this.offeringsLoaded) {
      await this.loadOfferings();
    }
    
    return Array.from(this.cachedPackages.values());
  }

  async purchasePackage(type: PackageType): Promise<{ 
    success: boolean; 
    customerInfo?: CustomerInfo; 
    error?: string;
    errorCode?: string;
  }> {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: 'Purchases only available in mobile app' };
    }
    
    if (!this.initialized) {
      return { success: false, error: 'Purchase system not initialized' };
    }
    
    const packageInfo = await this.getPackage(type);
    
    if (!packageInfo) {
      return { success: false, error: `Package ${type} not available` };
    }

    logger.log(`Starting purchase for ${type} (${packageInfo.product.identifier})`);

    try {
      const result = await Purchases.purchasePackage({ aPackage: packageInfo.package });
      this.customerInfo = result.customerInfo;
      logger.log(`✅ Purchase successful: ${type}`);
      return { success: true, customerInfo: result.customerInfo };
      
    } catch (error: any) {
      logger.error('❌ Purchase failed:', error);
      
      const errorCode = error.code;
      const errorMessage = error.message || '';
      
      if (errorCode === 'STORE_PURCHASE_CANCELLED' || errorMessage.toLowerCase().includes('cancelled')) {
        return { success: false, error: 'Purchase was cancelled', errorCode: 'cancelled' };
      }
      
      if (errorCode === 'STORE_PURCHASE_PENDING' || errorMessage.toLowerCase().includes('pending')) {
        return { success: false, error: 'Purchase is pending approval', errorCode: 'pending' };
      }
      
      if (errorCode === 'STORE_PRODUCT_ALREADY_OWNED' || errorMessage.toLowerCase().includes('already')) {
        return { success: false, error: 'You already own this product', errorCode: 'already_owned' };
      }
      
      if (errorCode === 'NETWORK_ERROR' || errorMessage.toLowerCase().includes('network')) {
        return { success: false, error: 'Network error. Please check your connection.', errorCode: 'network_error' };
      }
      
      return { success: false, error: errorMessage || 'Purchase failed', errorCode: errorCode };
    }
  }

  async purchaseProduct(productId: string): Promise<{ 
    success: boolean; 
    customerInfo?: CustomerInfo; 
    error?: string;
    errorCode?: string;
  }> {
    const packageType = PRODUCT_MAP[productId];
    
    if (!packageType) {
      return { success: false, error: `Unknown product ID: ${productId}` };
    }
    
    return this.purchasePackage(packageType);
  }

  async restorePurchases(): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: 'Restore only available in mobile app' };
    }
    
    if (!this.initialized) {
      return { success: false, error: 'Purchase system not initialized' };
    }

    try {
      const result = await Purchases.restorePurchases();
      this.customerInfo = result.customerInfo;
      const hasPremium = result.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive === true;
      logger.log(`✅ Purchases restored successfully. Premium active: ${hasPremium}`);
      return { success: true, customerInfo: result.customerInfo };
    } catch (error: any) {
      logger.error('❌ Restore failed:', error);
      return { success: false, error: error.message || 'No previous purchases found' };
    }
  }

  async getActiveEntitlements(): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) return [];
    const customerInfo = await this.refreshCustomerInfo();
    if (!customerInfo) return [];
    return Object.keys(customerInfo.entitlements.active);
  }

  async hasEntitlement(entitlementId: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    const customerInfo = await this.refreshCustomerInfo();
    if (!customerInfo) return false;
    const entitlement = customerInfo.entitlements.active[entitlementId];
    return entitlement?.isActive === true;
  }

}

export const revenuecatService = RevenueCatService.getInstance();
export { PREMIUM_ENTITLEMENT_ID };
export type { PackageInfo };