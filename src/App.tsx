import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import LandingPage from "./pages/LandingPage";
import GroupsPage from "./pages/GroupsPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import EmailVerifiedPage from "./pages/EmailVerifiedPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InvitePage from "./pages/InvitePage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import CommunityGuidelinesPage from "./pages/CommunityGuidelinesPage";
import SafetyDisclaimerPage from "./pages/SafetyDisclaimerPage";
import NotFound from "./pages/NotFound";
import AdminPage from "./pages/AdminPage";
import SafetyDisclaimerModal from "./components/SafetyDisclaimerModal";
import { useDailySpinReminder } from "./hooks/use-daily-spin-reminder";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useVisualMode } from "./hooks/use-visual-mode";
import { useSessionTimeout } from "./hooks/use-session-timeout";
import { useNetworkStatus } from "./hooks/use-network-status";
import { PurchaseProvider } from '@/contexts/PurchaseContext';
import { useBgMusic } from "./hooks/use-bg-music";
import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { admobService } from '@/services/admobService';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { notificationService } from '@/services/notificationService';
import { ensureUserNotificationSettings, syncNotificationSettingsToSupabase } from '@/lib/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

// ============================================
// PROTECTED ROUTE COMPONENT
// ============================================
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useAuth();
  if (!isReady) return null;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ============================================
// NOTIFICATION INITIALIZER - UPDATED
// ============================================
const NotificationInitializer = () => {
  const { user, isReady } = useAuth();
  const initializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const initNotifications = async () => {
      if (!isMounted.current) return;
      
      if (!Capacitor.isNativePlatform()) {
        console.log('📱 Not on native platform, skipping push notifications');
        return;
      }

      if (!isReady) {
        console.log('📱 Auth not ready, waiting...');
        return;
      }

      if (user?.id) {
        if (user.id !== previousUserIdRef.current) {
          console.log('📱 User changed, re-initializing notifications:', user.id);
          
          if (previousUserIdRef.current) {
            await notificationService.cleanup();
          }
          
          try {
          
            console.log('📱 Ensuring notification settings exist in Supabase...');
            await ensureUserNotificationSettings(user.id);
            
            await syncNotificationSettingsToSupabase(user.id);
            
            await notificationService.initialize();
            
            if (isMounted.current) {
              initializedRef.current = true;
              previousUserIdRef.current = user.id;
              setIsInitialized(true);
              console.log('✅ Notifications initialized for user:', user.id);
            }
          } catch (error) {
            console.error('❌ Failed to initialize push notifications:', error);
            if (isMounted.current) {
              setIsInitialized(false);
            }
          }
        } else if (!initializedRef.current) {
          try {
            await ensureUserNotificationSettings(user.id);
            await notificationService.initialize();
            if (isMounted.current) {
              initializedRef.current = true;
              setIsInitialized(true);
              console.log('✅ Notifications initialized for existing user:', user.id);
            }
          } catch (error) {
            console.error('❌ Failed to initialize push notifications:', error);
            if (isMounted.current) {
              setIsInitialized(false);
            }
          }
        }
      } else {
        if (previousUserIdRef.current) {
          console.log('📱 User logged out, cleaning up notifications');
          try {
            await notificationService.cleanup();
            await notificationService.removeToken();
          } catch (error) {
            console.error('❌ Error cleaning up notifications:', error);
          }
          if (isMounted.current) {
            previousUserIdRef.current = null;
            initializedRef.current = false;
            setIsInitialized(false);
          }
        }
      }
    };

    initNotifications();
  }, [user, isReady]);

  return null;
};

// ============================================
// ADMOB INITIALIZER
// ============================================
const AdMobInitializer = () => {
  const { user } = useAuth();
  const initializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const initAdMob = async () => {
      if (!Capacitor.isNativePlatform()) return;
      if (!isMounted.current) return;
      
      try {
        if (!initializedRef.current) {
          await admobService.initialize();
          initializedRef.current = true;
        }
        
        if (admobService.setSupabase) {
          admobService.setSupabase(supabase);
        }
        
        if (user?.id && user.id !== previousUserIdRef.current) {
          await admobService.setUser(user.id);
          previousUserIdRef.current = user.id;
        } else if (!user && previousUserIdRef.current) {
          await admobService.setUser(null);
          previousUserIdRef.current = null;
        }
      } catch (error) {
        console.error('Failed to initialize AdMob:', error);
      }
    };
    
    initAdMob();
    
    return () => {
      if (initializedRef.current && Capacitor.isNativePlatform()) {
        admobService.cleanup().catch(console.error);
        initializedRef.current = false;
      }
    };
  }, [user]);

  return null;
};


const AppCleanup = () => {
  const appStateListenerRef = useRef<any>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleBeforeUnload = () => {
      admobService.cleanup().catch(console.error);
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    const setupAppListeners = async () => {
      if (!isMounted.current) return;
      
      try {
        appStateListenerRef.current = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
          if (!isMounted.current) return;
          
          if (isActive) {
            notificationService.setAppForegroundState(true);
            
            try {
              await admobService.initialize();
              const { data: { user } } = await supabase.auth.getUser();
              if (user && isMounted.current) {
                await admobService.setUser(user.id);
              }
            } catch (error) {
              console.error('Failed to refresh AdMob on foreground:', error);
            }
          } else {
            notificationService.setAppForegroundState(false);
          }
        });
      } catch (error) {
        console.error('Failed to setup app state listeners:', error);
      }
    };
    
    setupAppListeners();
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (appStateListenerRef.current) {
        appStateListenerRef.current.remove();
      }
    };
  }, []);
  
  return null;
};


const NotificationRouteHandler = () => {
  const { user } = useAuth();
  const navigate = useNotificationNavigation();
  const [pendingNotification, setPendingNotification] = useState<any>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const handleNotification = async () => {
      if (!user || !isMounted.current) return;
      
      try {
        const pendingData = await notificationService.getPendingNavigation();
        if (pendingData?.screen && isMounted.current) {
          console.log('📩 Processing pending notification on route mount:', pendingData.screen);
          setPendingNotification(pendingData);
          
          setTimeout(() => {
            if (pendingData.screen && isMounted.current) {
              navigate.navigateFromNotification(pendingData);
            }
          }, 300);
        }
      } catch (error) {
        console.error('❌ Error handling notification route:', error);
      }
    };

    handleNotification();
  }, [user, navigate]);

  useEffect(() => {
    const handleNotificationTap = (event: Event) => {
      if (!isMounted.current) return;
      
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      
      if (data?.screen && user && isMounted.current) {
        console.log('📩 Notification tap detected, navigating:', data.screen);
        navigate.navigateFromNotification(data);
      }
    };

    window.addEventListener('notification-tap', handleNotificationTap);
    
    return () => {
      window.removeEventListener('notification-tap', handleNotificationTap);
    };
  }, [user, navigate]);

  return null;
};

function AppRoutes() {
  const { user } = useAuth();
  const { lastNotification } = useNotifications();

  useEffect(() => {
    if (lastNotification?.screen && user) {
      console.log('📩 Notification available:', lastNotification.type);
    }
  }, [lastNotification, user]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<GroupsPage />} />
      <Route path="/home" element={<LandingPage />} />
      <Route path="/squads" element={<GroupsPage />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/group/:id" element={<GroupDetailPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

// ============================================
// INNER APP COMPONENT
// ============================================
const AppInner = () => {
  const { user } = useAuth();
  const { isSupported } = useNotifications();

  useDailySpinReminder(user?.id ?? null);
  useVisualMode();
  useSessionTimeout(user?.id);
  useNetworkStatus();
  useBgMusic();

  useEffect(() => {
    if (isSupported) {
      console.log('📱 Push notifications are supported on this platform');
    }
  }, [isSupported]);

  return (
    <>
      <NotificationInitializer />
      <AdMobInitializer />
      <AppCleanup />
      
      <BrowserRouter>
        <NotificationRouteHandler />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/email-verified" element={<EmailVerifiedPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
          <Route path="/safety-disclaimer" element={<SafetyDisclaimerPage />} />
          
          <Route path="/squads/*" element={
            <ProtectedRoute>
              <GroupsPage />
            </ProtectedRoute>
          } />
          <Route path="/groups/*" element={
            <ProtectedRoute>
              <GroupsPage />
            </ProtectedRoute>
          } />
          <Route path="/group/:id/*" element={
            <ProtectedRoute>
              <GroupDetailPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/*" element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          } />
          
          <Route path="/home/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/chat/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/squad/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/poll/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/commands/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/credits/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/daily-spin/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/invites/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/warnings/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          <Route path="/actions/*" element={
            <ProtectedRoute>
              <AppRoutes />
            </ProtectedRoute>
          } />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      
      <Toaster />
      <Sonner richColors position="top-right" closeButton />
      <SafetyDisclaimerModal />
    </>
  );
};


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <PurchaseProvider>
          <AppInner />
        </PurchaseProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;