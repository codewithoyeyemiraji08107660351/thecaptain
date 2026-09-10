import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService, NotificationData } from '@/services/notificationService';

export const useNotificationNavigation = () => {
  const navigate = useNavigate();
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingNavigationRef = useRef<NotificationData | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const navigateToScreen = useCallback((data: NotificationData) => {
    if (!isMountedRef.current) {
      console.log('📩 Component unmounted, skipping navigation');
      return;
    }

    console.log('🔍 Navigating to screen:', data.screen, data);
    
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    const performNavigation = () => {
      if (!isMountedRef.current) return;
      
      if (!data.screen) {
        console.warn('⚠️ No screen specified in notification data');
        return;
      }

      let path: string;
      switch (data.screen) {
        case 'chat':
          path = data.chatId ? `/chat/${data.chatId}` : '/chat';
          break;
        case 'squad':
          path = data.squadId ? `/squad/${data.squadId}` : '/squad';
          break;
        case 'poll':
          path = data.pollId ? `/poll/${data.pollId}` : '/poll';
          break;
        case 'commands':
          path = '/commands';
          break;
        case 'credits':
          path = '/credits';
          break;
        case 'daily-spin':
          path = '/daily-spin';
          break;
        case 'invites':
          path = '/invites';
          break;
        case 'warnings':
          path = '/warnings';
          break;
        case 'actions':
          path = '/actions';
          break;
        case 'group':
        case 'groups':
          path = '/groups';
          break;
        case 'profile':
          path = '/profile';
          break;
        case 'settings':
          path = '/settings';
          break;
        default:
          console.warn(`⚠️ Unknown screen: ${data.screen}, navigating to home`);
          navigate('/', { 
            state: { 
              notificationData: data,
              fromNotification: true 
            } 
          });
          return;
      }

      if (isMountedRef.current) {
        navigate(path, { 
          state: { 
            notificationData: data,
            fromNotification: true 
          } 
        });
        pendingNavigationRef.current = null;
      }
    };

    navigationTimeoutRef.current = setTimeout(performNavigation, 150);
  }, [navigate]);

  const handlePendingNavigation = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const pendingData = await notificationService.getPendingNavigation();
      
      if (pendingData?.screen && isMountedRef.current) {
        console.log('📩 Processing pending notification from cold start:', pendingData.screen);
        pendingNavigationRef.current = pendingData;
        
        setTimeout(() => {
          if (pendingNavigationRef.current && isMountedRef.current) {
            navigateToScreen(pendingNavigationRef.current);
          }
        }, 500);
      }
    } catch (error) {
      console.error('❌ Error handling pending navigation:', error);
    }
  }, [navigateToScreen]);

  const handleCustomEvent = useCallback((event: Event) => {
    if (!isMountedRef.current) return;
    
    const customEvent = event as CustomEvent<NotificationData>;
    console.log('🎯 Custom event received:', customEvent.detail);
    
    if (!customEvent.detail || typeof customEvent.detail !== 'object') {
      console.warn('⚠️ Invalid notification event data');
      return;
    }

    const currentId = customEvent.detail.notificationId || 
                      customEvent.detail.eventId || 
                      JSON.stringify(customEvent.detail);
    
    const pendingId = pendingNavigationRef.current?.notificationId || 
                      pendingNavigationRef.current?.eventId || 
                      JSON.stringify(pendingNavigationRef.current);

    if (currentId === pendingId) {
      console.log('🔄 Duplicate navigation event ignored');
      return;
    }

    pendingNavigationRef.current = customEvent.detail;
    navigateToScreen(customEvent.detail);
  }, [navigateToScreen]);

  const handleNotificationToast = useCallback((event: Event) => {
    if (!isMountedRef.current) return;
    
    const customEvent = event as CustomEvent<NotificationData>;
    console.log('🍞 Notification toast clicked:', customEvent.detail);
    
    if (customEvent.detail?.screen && isMountedRef.current) {
      navigateToScreen(customEvent.detail);
    }
  }, [navigateToScreen]);

  useEffect(() => {
    handlePendingNavigation();

    window.addEventListener('notification-tap', handleCustomEvent);
    window.addEventListener('notification-toast-click', handleNotificationToast);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        handlePendingNavigation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('notification-tap', handleCustomEvent);
      window.removeEventListener('notification-toast-click', handleNotificationToast);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [handleCustomEvent, handleNotificationToast, handlePendingNavigation]);

  const navigateFromNotification = useCallback((data: NotificationData) => {
    if (!isMountedRef.current) return false;
    
    if (!data?.screen) {
      console.warn('⚠️ No screen in notification data');
      return false;
    }
    navigateToScreen(data);
    return true;
  }, [navigateToScreen]);

  const clearPendingNavigation = useCallback(() => {
    pendingNavigationRef.current = null;
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  }, []);

  return {
    navigateFromNotification,
    clearPendingNavigation,
    pendingNavigation: pendingNavigationRef.current,
  };
};