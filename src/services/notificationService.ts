import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import type { TokenReceivedEvent, NotificationReceivedEvent, NotificationActionPerformedEvent } from '@capacitor-firebase/messaging';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type NotificationType = 
  | 'RECEIVED_COMMAND'
  | 'NEW_SQUAD_COMMAND'
  | 'FAILED_COMMAND'
  | 'NEW_MESSAGE'
  | 'MENTION'
  | 'GROUP_INVITE'
  | 'NEW_MEMBER'
  | 'NEW_POLL'
  | 'POLL_RESULT'
  | 'CREDIT_GIFTING'
  | 'WARNING' 
  | 'ACTION_USED'
  | 'ACTION_CREDITS_USED'
  | 'SUPER_ACTION_USED'
  | 'DAILY_SPIN_AVAILABLE'
  | 'DAILY_SPIN_REMINDER'
  | 'POLL_UPDATE';

export interface NotificationData {
  type: NotificationType;
  screen?: string;
  chatId?: string;
  squadId?: string;
  pollId?: string;
  commandId?: string;
  userId?: string;
  amount?: number;
  creditsUsed?: number;
  remainingCredits?: number;
  reason?: string;
  expiresAt?: string;
  notificationId?: string;
  messageId?: string;
  timestamp?: string;
  [key: string]: any;
}

class NotificationService {
  private static instance: NotificationService;
  
  private tokenListeners = new Set<(token: string) => void>();
  private notificationListeners = new Set<(notification: NotificationData) => void>();
  
  private currentUserId: string | null = null;
  private currentToken: string | null = null;
  private deviceId: string | null = null;
  private tokenRefreshListener: PluginListenerHandle | null = null;
  private notificationReceivedListener: PluginListenerHandle | null = null;
  private notificationActionListener: PluginListenerHandle | null = null;
  private listeners: PluginListenerHandle[] = [];
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private isAppInForeground: boolean = true;
  
  private initVersion = 0;
  private notificationCache = new Map<string, number>();
  private readonly CACHE_EXPIRY_MS = 10000; 

  private readonly MAX_TOKEN_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private isMounted = true;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async getCurrentToken(): Promise<string | null> {
    return this.currentToken;
  }

  setAppForegroundState(isForeground: boolean): void {
    this.isAppInForeground = isForeground;
  }

  isAppInForegroundState(): boolean {
    return this.isAppInForeground;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('📱 Not on native platform, skipping push notifications');
      return;
    }

    if (this.initialized && this.currentToken) {
      console.log('📱 Already initialized with token:', this.currentToken?.substring(0, 20) + '...');
      this.notifyTokenListeners(this.currentToken);
      return;
    }

    if (this.initPromise) {
      console.log('📱 Already initializing, waiting...');
      return this.initPromise;
    }

    const currentVersion = ++this.initVersion;
    this.initPromise = this._initialize(currentVersion);
    return this.initPromise;
  }

  private async _initialize(version: number): Promise<void> {
    try {
      console.log('📱 Starting push notification initialization...');

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        this.currentUserId = user.id;
        console.log('📱 User ID set:', this.currentUserId);
      } else {
        console.warn('⚠️ No user found, push notifications will not be fully initialized');
        return;
      }

      this.deviceId = await this.getDeviceId();

      if (Capacitor.getPlatform() === 'android') {
        console.log('📱 Creating notification channels...');
        await this.createNotificationChannels();
      }

      console.log('📱 Checking notification permissions...');
      let permStatus = await FirebaseMessaging.checkPermissions();
      console.log('📱 Current permission status:', permStatus);
      
      if (permStatus.receive !== 'granted') {
        console.log('📱 Requesting notification permissions...');
        permStatus = await FirebaseMessaging.requestPermissions();
        console.log('📱 Permission after request:', permStatus);
      }
      
      if (permStatus.receive !== 'granted') {
        console.error('❌ Push notification permission denied');
        return;
      }

      console.log('📱 Getting FCM token...');
      const tokenResult = await this.getTokenWithRetry();
      
      if (tokenResult) {
        console.log('✅ FCM token obtained:', tokenResult.substring(0, 30) + '...');
        this.currentToken = tokenResult;
        this.notifyTokenListeners(tokenResult);
        
        const storedToken = await this.getStoredToken();
        if (storedToken !== tokenResult) {
          console.log('📱 Token differs from DB, updating...');
          const stored = await this.storeToken(tokenResult);
          if (stored) {
            console.log('✅ Token stored in database successfully');
          } else {
            console.warn('⚠️ Token not stored in database');
          }
        } else {
          console.log('✅ Token matches database');
        }
      } else {
        console.error('❌ Failed to obtain FCM token');
        return;
      }
      
      console.log('📱 Setting up notification listeners...');
      await this.setupListeners();
      
      await this.checkPendingNavigation();
      
      if (version === this.initVersion) {
        this.initialized = true;
        console.log('✅ Push notification initialization complete!');
      }
    } catch (error) {
      console.error('❌ Failed to initialize push notifications:', error);
      if (version === this.initVersion) {
        throw error;
      }
    } finally {
      if (version === this.initVersion) {
        this.initPromise = null;
      }
    }
  }

  private async getTokenWithRetry(): Promise<string | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_TOKEN_RETRIES; attempt++) {
      try {
        const { token } = await FirebaseMessaging.getToken();
        if (token) {
          console.log(`✅ FCM token obtained successfully (attempt ${attempt})`);
          return token;
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`❌ Failed to get FCM token (attempt ${attempt}/${this.MAX_TOKEN_RETRIES}):`, error);
        
        if (error instanceof Error) {
          const msg = error.message || '';
          if (msg.includes('Permission denied') || 
              msg.includes('not configured') ||
              msg.includes('IllegalStateException')) {
            console.error('❌ Permanent error, not retrying');
            break;
          }
        }
        
        if (attempt === this.MAX_TOKEN_RETRIES) {
          throw error;
        }
        
        const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return null;
  }

  private async getDeviceId(): Promise<string> {
    try {
      const { value } = await Preferences.get({ key: 'device_id' });
      if (value) {
        return value;
      }
      
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      await Preferences.set({ key: 'device_id', value: deviceId });
      return deviceId;
    } catch (error) {
      console.error('❌ Error getting device ID:', error);
      return `device_${Date.now()}`;
    }
  }

  private async getStoredToken(): Promise<string | null> {
    try {
      if (!this.currentUserId) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('fcm_token')
        .eq('id', this.currentUserId)
        .single();

      if (error) {
        console.error('❌ Error getting stored token:', error);
        return null;
      }

      return data?.fcm_token || null;
    } catch (error) {
      console.error('❌ Error getting stored token:', error);
      return null;
    }
  }

  private async createNotificationChannels(): Promise<void> {
    try {
      const channels = [
        {
          id: 'commands',
          name: 'Commands',
          description: 'Urgent command notifications',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        },
        {
          id: 'chat',
          name: 'Chat Messages',
          description: 'New message notifications',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        },
        {
          id: 'squad',
          name: 'Squad Updates',
          description: 'Squad member and activity updates',
          importance: 3,
          visibility: 1,
          sound: 'default',
          vibration: true,
        },
        {
          id: 'rewards',
          name: 'Rewards',
          description: 'Daily spins and reward notifications',
          importance: 3,
          visibility: 1,
          sound: 'default',
          vibration: true,
        },
        {
          id: 'general_notifications',
          name: 'General Notifications',
          description: 'All other app notifications',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        },
      ];

      for (const channel of channels) {
        try {
          await FirebaseMessaging.createChannel(channel);
          console.log(`✅ Channel created: ${channel.name}`);
        } catch (error) {
          console.warn(`⚠️ Channel ${channel.name} may already exist:`, error);
        }
      }
      console.log('✅ All notification channels created');
    } catch (error) {
      console.error('❌ Error creating notification channels:', error);
    }
  }

  private async setupListeners(): Promise<void> {
    await this.cleanup();

    try {
      this.tokenRefreshListener = await FirebaseMessaging.addListener('tokenReceived', async (event: TokenReceivedEvent) => {
        console.log('🔄 Token refreshed:', event.token);
        if (event.token !== this.currentToken) {
          this.currentToken = event.token;
          await this.storeToken(event.token);
          this.notifyTokenListeners(event.token);
        }
      });
      this.listeners.push(this.tokenRefreshListener);

      this.notificationReceivedListener = await FirebaseMessaging.addListener('notificationReceived', (notification: NotificationReceivedEvent) => {
        console.log('📩 Notification received in foreground:', notification);
        const notificationData = this.parseNotificationData(notification);
        
        if (this.shouldDeduplicateNotification(notificationData)) {
          console.log('📩 Duplicate notification ignored');
          return;
        }
        
        if (notificationData) {
          console.log('📩 Parsed notification data:', notificationData);
          this.notifyNotificationListeners(notificationData);
          this.showInAppNotification(notificationData);
        }
      });
      this.listeners.push(this.notificationReceivedListener);
      
      this.notificationActionListener = await FirebaseMessaging.addListener('notificationActionPerformed', async (tap: NotificationActionPerformedEvent) => {
        console.log('👆 Notification tapped:', tap);
        const notificationData = this.parseNotificationDataFromTap(tap);
        
        if (notificationData && notificationData.screen) {
          console.log('👆 Navigating to screen:', notificationData.screen);
          await this.storePendingNavigation(notificationData);
          await this.handlePendingNavigation();
        }
      });
      this.listeners.push(this.notificationActionListener);

      console.log('✅ All notification listeners set up');
    } catch (error) {
      console.error('❌ Error setting up listeners:', error);
      throw error;
    }
  }

  private parseNotificationData(notification: NotificationReceivedEvent): NotificationData | null {
    try {
      const rawData = notification.notification?.data;
      
      if (!rawData) {
        console.warn('📩 No data in notification');
        return null;
      }
      
      let parsedData: any;
      if (typeof rawData === 'string') {
        parsedData = JSON.parse(rawData);
      } else {
        parsedData = rawData;
      }
      
      if (!parsedData?.type && !parsedData?.screen) {
        console.warn('📩 Notification data missing type/screen field:', parsedData);
        return null;
      }
      
      if (!parsedData.notificationId) {
        parsedData.notificationId = `${parsedData.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }
      
      return parsedData as NotificationData;
    } catch (error) {
      console.error('❌ Failed to parse notification data:', error);
      return null;
    }
  }

  private parseNotificationDataFromTap(tap: NotificationActionPerformedEvent): NotificationData | null {
    try {
      const rawData = tap.notification?.data;
      
      if (!rawData) {
        console.warn('👆 No data in notification tap');
        return null;
      }
      
      let parsedData: any;
      if (typeof rawData === 'string') {
        parsedData = JSON.parse(rawData);
      } else {
        parsedData = rawData;
      }
      
      if (!parsedData?.screen && !parsedData?.type) {
        console.warn('👆 Notification tap data missing screen/type field:', parsedData);
        return null;
      }
      
      return parsedData as NotificationData;
    } catch (error) {
      console.error('❌ Failed to parse notification tap data:', error);
      return null;
    }
  }

  private shouldDeduplicateNotification(notification: NotificationData | null): boolean {
    if (!notification) return true;
    
    const fingerprint = this.generateNotificationFingerprint(notification);
    const now = Date.now();
    
    if (this.notificationCache.has(fingerprint)) {
      const lastSeen = this.notificationCache.get(fingerprint) || 0;
      if (now - lastSeen < this.CACHE_EXPIRY_MS) {
        return true;
      }
    }
    
    for (const [key, timestamp] of this.notificationCache.entries()) {
      if (now - timestamp > this.CACHE_EXPIRY_MS) {
        this.notificationCache.delete(key);
      }
    }
    
    this.notificationCache.set(fingerprint, now);
    return false;
  }

  private generateNotificationFingerprint(notification: NotificationData): string {
    const keyFields = ['type', 'screen', 'squadId', 'pollId', 'commandId', 'chatId', 'userId', 'messageId', 'notificationId'];
    const fingerprint: any = {};
    
    for (const field of keyFields) {
      if (notification[field]) {
        fingerprint[field] = notification[field];
      }
    }
    
    if (notification.timestamp) {
      const date = new Date(notification.timestamp);
      fingerprint.timeBucket = Math.floor(date.getTime() / 60000);
    }
    
    return JSON.stringify(fingerprint);
  }

  private async storePendingNavigation(data: NotificationData): Promise<void> {
    try {
      await Preferences.set({
        key: 'pending_notification',
        value: JSON.stringify({
          ...data,
          timestamp: Date.now()
        })
      });
      console.log('📩 Pending notification stored for cold start');
    } catch (error) {
      console.error('❌ Failed to store pending notification:', error);
    }
  }

  private async checkPendingNavigation(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'pending_notification' });
      if (value) {
        console.log('📩 Found pending notification on startup');
        await this.handlePendingNavigation();
      }
    } catch (error) {
      console.error('❌ Error checking pending navigation:', error);
    }
  }

  private async handlePendingNavigation(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'pending_notification' });
      if (!value) {
        console.log('📩 No pending navigation');
        return;
      }

      const parsed = JSON.parse(value);
      
      const timestamp = parsed.timestamp || 0;
      const now = Date.now();
      if (now - timestamp > 300000) {
        console.log('📩 Pending notification expired, discarding');
        await Preferences.remove({ key: 'pending_notification' });
        return;
      }

      console.log('📩 Processing pending notification:', parsed.screen);
      
      await Preferences.remove({ key: 'pending_notification' });
      
      window.dispatchEvent(new CustomEvent('notification-tap', { detail: parsed }));
      
    } catch (error) {
      console.error('❌ Error handling pending navigation:', error);
    }
  }

  private showInAppNotification(data: NotificationData): void {
    const title = this.getNotificationTitle(data.type);
    const body = this.getNotificationBody(data);
    
    window.dispatchEvent(new CustomEvent('in-app-notification', {
      detail: { title, body, data }
    }));
  }

  private getNotificationTitle(type: string): string {
    const titles: Record<string, string> = {
      'RECEIVED_COMMAND': '⚓ Command Received',
      'NEW_SQUAD_COMMAND': '⚓ New Squad Command',
      'FAILED_COMMAND': '❌ Command Failed',
      'NEW_MESSAGE': '💬 New Message',
      'MENTION': '🔔 You Were Mentioned',
      'GROUP_INVITE': '👥 Group Invite',
      'NEW_MEMBER': '👤 New Member',
      'NEW_POLL': '📊 New Poll',
      'POLL_RESULT': '📊 Poll Result',
      'CREDIT_GIFTING': '🎁 Credits Received',
      'WARNING': '⚠️ Warning',
      'ACTION_USED': '⚡ Action Used',
      'SUPER_ACTION_USED': '💥 Super Action!',
      'DAILY_SPIN_AVAILABLE': '🎡 Daily Spin Ready',
      'DAILY_SPIN_REMINDER': '🎡 Daily Spin Reminder',
    };
    return titles[type] || '📱 Notification';
  }

  private getNotificationBody(data: NotificationData): string {
    switch (data.type) {
      case 'RECEIVED_COMMAND':
        return `${data.sender || 'Someone'} has issued you a command!`;
      case 'NEW_SQUAD_COMMAND':
        return `${data.sender || 'Someone'} issued a new squad command!`;
      case 'FAILED_COMMAND':
        return `${data.recipient || 'Someone'} failed the command!`;
      case 'NEW_MESSAGE':
        return `${data.sender || 'Someone'} sent a message`;
      case 'MENTION':
        return `${data.sender || 'Someone'} mentioned you`;
      case 'NEW_MEMBER':
        return `${data.name || 'Someone'} joined ${data.squad || 'a squad'}!`;
      default:
        return 'You have a new notification';
    }
  }

  private async storeToken(token: string): Promise<boolean> {
    if (!this.currentUserId) {
      console.warn('⚠️ No user ID, cannot store token');
      return false;
    }

    try {
      console.log('📱 Storing FCM token for user:', this.currentUserId);
      console.log('📱 Token:', token.substring(0, 30) + '...');
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', this.currentUserId)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        console.log('📱 Creating profile for user:', this.currentUserId);
        
        const { data: { user } } = await supabase.auth.getUser();
        
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: this.currentUserId,
            username: user?.email?.split('@')[0] || `user_${this.currentUserId.substring(0, 8)}`,
            first_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || '',
            avatar: '👤',
            created_at: new Date().toISOString(),
            is_premium: false,
            action_credits: 5,
            super_credits: 2,
            warnings: 0,
            completed_commands: 0,
            consecutive_fails: 0,
            fcm_token: token,
            fcm_token_updated_at: new Date().toISOString()
          } as any);

        if (insertError) {
          console.error('❌ Failed to create profile:', insertError);
          return false;
        }
        console.log('✅ Profile created with FCM token');
        return true;
      }

      if (profileError) {
        console.error('❌ Error checking profile:', profileError);
        return false;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          fcm_token: token,
          fcm_token_updated_at: new Date().toISOString()
        } as any)
        .eq('id', this.currentUserId);

      if (updateError) {
        console.error('❌ Failed to update FCM token:', updateError);
        
        if (updateError.message && updateError.message.includes('column "fcm_token" does not exist')) {
          console.error('❌ The fcm_token column does not exist in the profiles table!');
          console.error('⚠️ Please run the migration SQL to add the column.');
        }
        return false;
      }

      console.log('✅ FCM token updated in database successfully');
      
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('fcm_token')
        .eq('id', this.currentUserId)
        .single();

      if (verifyError) {
        console.error('❌ Failed to verify token storage:', verifyError);
        return false;
      } else if (verifyData?.fcm_token) {
        console.log('✅ Token verified in database: Present');
        return true;
      } else {
        console.warn('⚠️ Token not found in database after storage attempt');
        return false;
      }

    } catch (error) {
      console.error('❌ Error storing FCM token:', error);
      return false;
    }
  }

  async removeToken(): Promise<void> {
    if (!this.currentUserId) {
      console.warn('⚠️ No user ID, cannot remove token');
      return;
    }
    
    try {
      console.log('📱 Removing FCM token for user:', this.currentUserId);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          fcm_token: null,
          fcm_token_updated_at: new Date().toISOString()
        } as any)
        .eq('id', this.currentUserId);

      if (error) {
        console.error('❌ Error removing FCM token:', error);
      } else {
        console.log('✅ FCM token removed from database');
      }
      
      this.currentToken = null;
    } catch (error) {
      console.error('❌ Error removing FCM token:', error);
    }
  }

  async cleanup(): Promise<void> {
    console.log('📱 Cleaning up notification listeners...');
    for (const listener of this.listeners) {
      try {
        await listener.remove();
      } catch (e) {
        console.error('Error removing listener:', e);
      }
    }
    this.listeners = [];
    this.tokenRefreshListener = null;
    this.notificationReceivedListener = null;
    this.notificationActionListener = null;
    console.log('✅ Notification listeners cleaned up');
  }

  onToken(callback: (token: string) => void): () => void {
    this.tokenListeners.add(callback);
    console.log(`📱 Token listener registered. Total: ${this.tokenListeners.size}`);
    
    if (this.currentToken) {
      setTimeout(() => {
        try {
          callback(this.currentToken!);
        } catch (error) {
          console.error('Error in immediate token callback:', error);
        }
      }, 0);
    }
    
    return () => {
      this.tokenListeners.delete(callback);
      console.log(`📱 Token listener removed. Total: ${this.tokenListeners.size}`);
    };
  }

  onNotification(callback: (notification: NotificationData) => void): () => void {
    this.notificationListeners.add(callback);
    console.log(`📱 Notification listener registered. Total: ${this.notificationListeners.size}`);
    
    return () => {
      this.notificationListeners.delete(callback);
      console.log(`📱 Notification listener removed. Total: ${this.notificationListeners.size}`);
    };
  }

  private notifyTokenListeners(token: string): void {
    console.log(`📱 Notifying ${this.tokenListeners.size} token listeners`);
    this.tokenListeners.forEach(listener => {
      try {
        listener(token);
      } catch (error) {
        console.error('Error in token listener:', error);
      }
    });
  }

  private notifyNotificationListeners(notification: NotificationData | null): void {
    if (!notification) {
      console.warn('⚠️ Received null notification, skipping');
      return;
    }
    
    console.log(`📱 Notifying ${this.notificationListeners.size} notification listeners`);
    this.notificationListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  async getPendingNavigation(): Promise<NotificationData | null> {
    try {
      const { value } = await Preferences.get({ key: 'pending_notification' });
      if (value) {
        await Preferences.remove({ key: 'pending_notification' });
        const parsed = JSON.parse(value);
        
        const timestamp = parsed.timestamp || 0;
        if (Date.now() - timestamp > 300000) {
          console.log('📩 Pending notification expired');
          return null;
        }
        
        console.log('📩 Retrieved pending notification:', parsed.screen);
        return parsed;
      }
    } catch (error) {
      console.error('❌ Error getting pending navigation:', error);
    }
    return null;
  }

  async reset(): Promise<void> {
    console.log('🔄 Resetting notification service...');
    
    this.initVersion++;
    
    await this.cleanup();
    this.initialized = false;
    this.currentToken = null;
    this.initPromise = null;
    this.notificationCache.clear();
    
    this.tokenListeners.clear();
    this.notificationListeners.clear();
    
    await Preferences.remove({ key: 'pending_notification' });
    await Preferences.remove({ key: 'device_id' });
    
    console.log('✅ Notification service reset complete');
  }

  async sendNotification(
    userId: string,
    title: string,
    body: string,
    data: NotificationData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📤 Sending notification to:', userId);
      
      const { data: result, error } = await supabase.functions.invoke('send-notification', {
        body: {
          userId,
          title,
          body,
          data: {
            ...data,
            type: data.type || 'general',
            timestamp: Date.now().toString(),
          }
        }
      });

      if (error) {
        console.error('❌ Failed to send notification:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Notification sent successfully:', result);
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async sendBatchNotifications(
    userIds: string[],
    title: string,
    body: string,
    data: NotificationData
  ): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      console.log(`📤 Sending batch notification to ${userIds.length} users`);
      
      const { data: result, error } = await supabase.functions.invoke('send-notification', {
        body: {
          userIds,
          title,
          body,
          data: {
            ...data,
            type: data.type || 'general',
            timestamp: Date.now().toString(),
          }
        }
      });

      if (error) {
        console.error('❌ Failed to send batch notifications:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Batch notifications sent successfully:', result);
      return { success: true, results: result };
    } catch (error) {
      console.error('❌ Error sending batch notifications:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getUserToken(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('fcm_token')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Error getting user token:', error);
        return null;
      }

      return (data as any)?.fcm_token || null;
    } catch (error) {
      console.error('❌ Error getting user token:', error);
      return null;
    }
  }

  async checkPermissions(): Promise<boolean> {
    try {
      const permStatus = await FirebaseMessaging.checkPermissions();
      return permStatus.receive === 'granted';
    } catch (error) {
      console.error('❌ Error checking permissions:', error);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const permStatus = await FirebaseMessaging.requestPermissions();
      return permStatus.receive === 'granted';
    } catch (error) {
      console.error('❌ Error requesting permissions:', error);
      return false;
    }
  }

  getNotificationCount(data: NotificationData): number {
    // Count similar notifications in cache
    let count = 0;
    const fingerprint = this.generateNotificationFingerprint(data);
    for (const [key, _] of this.notificationCache) {
      if (key === fingerprint) {
        count++;
      }
    }
    return count;
  }
}

export const notificationService = NotificationService.getInstance();