import { useEffect, useState, useRef, useCallback } from 'react';
import { notificationService, NotificationData } from '@/services/notificationService';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

export const useNotifications = () => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [lastNotification, setLastNotification] = useState<NotificationData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const mountedRef = useRef(true);
  const initAttemptedRef = useRef(false);
  const toastIdRef = useRef<string | number | null>(null);
  const unsubscribeTokenRef = useRef<(() => void) | null>(null);
  const unsubscribeNotificationRef = useRef<(() => void) | null>(null);
  const isInitializingRef = useRef(false);

  const getNotificationTitle = useCallback((type: string): string => {
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
      'ACTION_CREDITS_USED': '⚡ Action Credits Used',
      'SUPER_ACTION_USED': '💥 Super Action!',
      'DAILY_SPIN_AVAILABLE': '🎡 Daily Spin Ready',
      'DAILY_SPIN_REMINDER': '🎡 Daily Spin Reminder',
      'POLL_UPDATE': '📊 Poll Update',
    };
    return titles[type] || '📱 Notification';
  }, []);

  const getNotificationBody = useCallback((data: NotificationData): string => {
    switch (data.type) {
      case 'RECEIVED_COMMAND':
        return `${data.sender || 'Someone'} has issued you a command!`;
      case 'NEW_SQUAD_COMMAND':
        return `${data.sender || 'Someone'} has issued a command to a fellow squad member!`;
      case 'FAILED_COMMAND':
        return `${data.recipient || 'Someone'} has failed the command!`;
      case 'NEW_MESSAGE':
        const preview = data.messagePreview ? `: "${data.messagePreview.substring(0, 40)}${data.messagePreview.length > 40 ? '...' : ''}"` : '';
        return `${data.sender || 'Someone'} sent a message${preview}`;
      case 'MENTION':
        return `${data.sender || 'Someone'} mentioned you in ${data.chatName || 'comms'}!`;
      case 'GROUP_INVITE':
        return `You've been invited to join ${data.groupName || 'a group'}!`;
      case 'NEW_MEMBER':
        return `${data.name || 'Someone'} has joined ${data.squad || 'a squad'}!`;
      case 'NEW_POLL':
        return `A new poll has been created in ${data.squad || 'your squad'}. Cast your vote!`;
      case 'POLL_RESULT':
        return `A poll has ended. Check the results!`;
      case 'CREDIT_GIFTING':
        return `${data.sender || 'Someone'} has gifted you ${data.amount || 1} Action Credit(s)!`;
      case 'WARNING':
        return `You have received an official warning from ${data.squadName || 'a squad'}!`;
      case 'ACTION_USED':
        return `${data.sender || 'Someone'} used ${data.actionName || 'an Action'} against you!`;
      case 'ACTION_CREDITS_USED':
        return `${data.creditsUsed || 0} Action Credit(s) used. ${data.remainingCredits || 0} remaining.`;
      case 'SUPER_ACTION_USED':
        return `${data.sender || 'Someone'} unleashed a Super Action on you!`;
      case 'DAILY_SPIN_AVAILABLE':
      case 'DAILY_SPIN_REMINDER':
        return 'Your daily spin is available! Come claim your reward.';
      case 'POLL_UPDATE':
        return `A punishment poll is live in ${data.squad || 'your squad'}. Cast your vote!`;
      default:
        return 'You have a new notification';
    }
  }, []);

  const showInAppNotification = useCallback((notificationData: NotificationData) => {
    // ✅ Critical: Check if component is mounted
    if (!mountedRef.current) {
      console.log('📱 Component unmounted, skipping notification');
      return;
    }

    // ✅ Check if app is in foreground
    if (!notificationService.isAppInForegroundState()) {
      console.log('📱 App in background, skipping in-app notification');
      return;
    }

    const title = getNotificationTitle(notificationData.type);
    const body = getNotificationBody(notificationData);
    
    // ✅ Dismiss previous toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }

    // ✅ Use a unique ID for the toast
    const id = Date.now().toString();
    
    toastIdRef.current = toast(title, {
      id: id, // ✅ Use stable ID
      description: body,
      duration: notificationData.type === 'RECEIVED_COMMAND' ? 8000 : 5000,
      action: {
        label: 'View',
        onClick: () => {
          if (notificationData.screen && mountedRef.current) {
            window.dispatchEvent(new CustomEvent('notification-tap', { 
              detail: notificationData
            }));
          }
        },
      },
      position: 'top-center',
      closeButton: true,
      className: 'notification-toast',
      onDismiss: () => {
        if (toastIdRef.current === id) {
          toastIdRef.current = null;
        }
      },
      onAutoClose: () => {
        if (toastIdRef.current === id) {
          toastIdRef.current = null;
        }
      },
    });
  }, [getNotificationTitle, getNotificationBody]);

  const handleToken = useCallback((token: string) => {
    if (!mountedRef.current) return;
    console.log('✅ FCM Token received:', token.substring(0, 20) + '...');
    setFcmToken(token);
  }, []);

  const handleNotification = useCallback((notificationData: NotificationData) => {
    if (!mountedRef.current) return;
    console.log('📩 Notification received in hook:', notificationData);
    setLastNotification(notificationData);
    showInAppNotification(notificationData);
  }, [showInAppNotification]);

  // ✅ Initialize notifications - only once
  useEffect(() => {
    mountedRef.current = true;
    
    if (initAttemptedRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    initAttemptedRef.current = true;

    const init = async () => {
      try {
        if (!Capacitor.isNativePlatform()) {
          console.log('📱 Not on native platform, skipping push notifications');
          return;
        }

        await notificationService.initialize();
        console.log('📱 Notification service initialized');
        if (mountedRef.current) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
        if (mountedRef.current) {
          setIsInitialized(false);
        }
      } finally {
        isInitializingRef.current = false;
      }
    };
    
    init();

    // ✅ Subscribe to events with proper cleanup
    unsubscribeTokenRef.current = notificationService.onToken(handleToken);
    unsubscribeNotificationRef.current = notificationService.onNotification(handleNotification);

    return () => {
      mountedRef.current = false;
      
      // ✅ Clean up listeners
      if (unsubscribeTokenRef.current) {
        try {
          unsubscribeTokenRef.current();
        } catch (e) {
          console.error('Error removing token listener:', e);
        }
        unsubscribeTokenRef.current = null;
      }
      
      if (unsubscribeNotificationRef.current) {
        try {
          unsubscribeNotificationRef.current();
        } catch (e) {
          console.error('Error removing notification listener:', e);
        }
        unsubscribeNotificationRef.current = null;
      }
      
      // ✅ Dismiss any pending toast
      if (toastIdRef.current) {
        try {
          toast.dismiss(toastIdRef.current);
        } catch (e) {
          // Ignore
        }
        toastIdRef.current = null;
      }
    };
  }, [handleToken, handleNotification]);

  const refreshToken = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const token = await notificationService.getCurrentToken();
      if (token && mountedRef.current) {
        setFcmToken(token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      return await notificationService.checkPermissions();
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const granted = await notificationService.requestPermissions();
      if (granted && mountedRef.current) {
        await notificationService.initialize();
        setIsInitialized(true);
      }
      return granted;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }, []);

  const clearLastNotification = useCallback(() => {
    if (mountedRef.current) {
      setLastNotification(null);
    }
  }, []);

  return {
    fcmToken,
    lastNotification,
    isInitialized,
    isSupported: Capacitor.isNativePlatform(),
    refreshToken,
    checkPermissions,
    requestPermissions,
    clearLastNotification,
  };
};