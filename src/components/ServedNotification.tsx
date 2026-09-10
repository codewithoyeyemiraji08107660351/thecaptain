// src/components/ServedNotification.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ServeAction, User } from "@/lib/mockData";
import { playReceiveCommandSound, playButtonSound } from "@/lib/sounds";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";

interface ServedNotificationProps {
  serve: ServeAction;
  members: User[];
  isServed: boolean;
  actionCredits?: number;
  onActionPress?: () => void;
  squadId?: string;
  squadName?: string;
  onCommandCompleted?: (serveId: string) => void;
  onCommandFailed?: (serveId: string) => void;
  onActionUsed?: (serveId: string, actionName: string) => void;
}

const formatTimeLeft = (ms: number) => {
  if (ms <= 0) return "⏰ Time expired!";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes} min ${seconds} sec left`;
};

const ServedNotification = ({ 
  serve, 
  members, 
  isServed, 
  actionCredits = 0, 
  onActionPress,
  squadId,
  squadName = "Squad",
  onCommandCompleted,
  onCommandFailed,
  onActionUsed
}: ServedNotificationProps) => {
  const { user } = useAuth();
  const from = members.find(m => m.id === serve.fromUserId);
  const to = members.find(m => m.id === serve.toUserId);
  const [now, setNow] = useState(Date.now());
  const notifiedRef = useRef<Set<string>>(new Set());
  const isLegendary = !!serve.isLegendary;
  const hasTriggeredNotifications = useRef(false);
  const isProcessingRef = useRef(false);

  const getNotificationType = useCallback((): string => {
    if (isLegendary) return 'superActionsAgainstYou';
    return 'actionCreditsAgainstYou';
  }, [isLegendary]);

  useEffect(() => {
    if (isServed) playReceiveCommandSound();
  }, [isServed]);

  useEffect(() => {
    const timeLeft = serve.expiresAt.getTime() - Date.now();
    if (timeLeft <= 0) return;
    const interval = timeLeft < 3600000 ? 1000 : 30000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [serve.expiresAt]);

  const timeLeft = Math.max(0, serve.expiresAt.getTime() - now);

  useEffect(() => {
    if (isServed && !hasTriggeredNotifications.current && user?.id) {
      hasTriggeredNotifications.current = true;
      
      const sendNotifications = async () => {
        try {
          const senderName = from?.username || 'Someone';
          
      
          if (isNotificationEnabled('newCommands')) {
            if (squadId && members.length > 1) {
              const otherMemberIds = members
                .filter(m => m.id !== serve.toUserId && m.id !== serve.fromUserId)
                .map(m => m.id);
              
              if (otherMemberIds.length > 0) {
                await notificationTriggers.triggerNewSquadCommand(
                  squadId,
                  squadName,
                  senderName,
                  otherMemberIds
                );
              }
            }
          }
          
        } catch (error) {
          console.error('Failed to send push notifications:', error);
        }
      };
      
      sendNotifications();
    }
  }, [isServed, user?.id, from, squadId, squadName, members, serve.toUserId, serve.fromUserId, serve.id]);

  // ✅ Time-based warnings
  useEffect(() => {
    if (!isServed || serve.completed || serve.failed) return;
    
    const thresholds = [
      { key: "1h", ms: 3600000, label: "1 hour" },
      { key: "10m", ms: 600000, label: "10 minutes" },
      { key: "1m", ms: 60000, label: "1 minute" },
    ];
    
    for (const t of thresholds) {
      if (timeLeft <= t.ms && timeLeft > 0 && !notifiedRef.current.has(t.key)) {
        notifiedRef.current.add(t.key);
        toast.warning(`⏰ ${t.label} left to complete your ${isLegendary ? "LEGENDARY " : ""}command!`, {
          description: `"${serve.prompt}"`,
          duration: 5000,
        });
      }
    }
  }, [timeLeft, isServed, serve, isLegendary]);

  const handleActionComplete = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!user?.id) return;
    
    isProcessingRef.current = true;
    
    try {
      
      if (onCommandCompleted) {
        onCommandCompleted(serve.id);
      }
      
      if (onActionPress) {
        playButtonSound();
        onActionPress();
      }
    } catch (error) {
      console.error('Error in action completion:', error);
      if (onActionPress) {
        playButtonSound();
        onActionPress();
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [serve.id, onCommandCompleted, onActionPress]);

  const handleCommandFailed = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!user?.id) return;
    
    isProcessingRef.current = true;
    
    try {
      if (!isNotificationEnabled('failedCommands')) {
        console.log('Failed command notifications are disabled, skipping');
        return;
      }

      // ✅ ONLY notify the commander that the target failed
      // The main failure notification is handled in GroupDetailPage.tsx
      if (serve.fromUserId && serve.fromUserId !== user.id) {
        const targetName = to?.username || 'Someone';
        await notificationTriggers.triggerFailedCommand(
          serve.fromUserId,
          targetName,
          serve.prompt.substring(0, 30) + '...',
          serve.id
        );
      }

      if (onCommandFailed) {
        onCommandFailed(serve.id);
      }
    } catch (error) {
      console.error('Failed to send failure notification:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [user?.id, serve.fromUserId, serve.prompt, serve.id, to, onCommandFailed]);

  // ============================================
  // ✅ Handle action used against user
  // ============================================
  const handleActionUsed = useCallback(async (actionName: string) => {
    if (isProcessingRef.current) return;
    if (!user?.id) return;
    
    isProcessingRef.current = true;
    
    try {
      const notificationType = getNotificationType();
      
      if (!isNotificationEnabled(notificationType as any)) {
        console.log(`${notificationType} notifications are disabled, skipping`);
        return;
      }

      if (serve.toUserId && user.id !== serve.toUserId) {
        const targetName = to?.username || 'Someone';
        
        if (isLegendary) {
          await notificationTriggers.triggerSuperActionUsed(
            user.id,
            targetName,
            actionName,
            serve.id
          );
        } else {
          await notificationTriggers.triggerActionUsed(
            user.id,
            targetName,
            actionName,
            serve.id
          );
        }
      }

      if (onActionUsed) {
        onActionUsed(serve.id, actionName);
      }
    } catch (error) {
      console.error('Failed to send action used notification:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [user?.id, serve.toUserId, serve.id, to, isLegendary, getNotificationType, onActionUsed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={`rounded-2xl p-3 mb-4 border ${
        isLegendary
          ? "border-yellow-500/50"
          : isServed
            ? "bg-accent/10 border-accent/30 animate-glow-fade"
            : "card-game"
      }`}
      style={isLegendary ? {
        background: "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(255,165,0,0.05) 100%)",
        boxShadow: "0 0 20px rgba(255,215,0,0.15), inset 0 0 20px rgba(255,215,0,0.05)",
        animation: "pulse 2s ease-in-out infinite",
      } : undefined}
    >
      <div className="flex items-start gap-3">
        {isLegendary ? (
          <Crown className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "gold" }} />
        ) : isServed ? (
          <AlertTriangle className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        ) : null}
        <div className="flex-1">
          <p className="text-xs font-semibold mb-1">
            {isLegendary && isServed ? (
              <span style={{ color: "gold" }}>✨ LEGENDARY COMMAND ✨</span>
            ) : isServed ? (
              <span className="text-accent">YOU'VE RECEIVED A COMMAND</span>
            ) : (
              <span>
                <span className="invert-protect">{from?.avatar}</span> <span className="text-primary">{from?.username}</span>{" "}
                commanded <span className="invert-protect">{to?.avatar}</span> <span className="text-accent">{to?.username}</span> to:
                {isLegendary && <span style={{ color: "gold" }}> ✨ LEGENDARY</span>}
              </span>
            )}
          </p>
          <p className="text-foreground font-medium text-sm">"{serve.prompt}"</p>
          {isLegendary && (
            <p className="text-[10px] mt-1 font-bold" style={{ color: "gold" }}>
              ⭐ Counts as completing 2 commands + 1 action credit!
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">{formatTimeLeft(timeLeft)}</p>
          </div>
          {isServed && !isLegendary && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Complete the mission. The Captain will confirm it.
            </p>
          )}
        </div>
      </div>
      {isServed && onActionPress && (
        <div className="flex justify-end mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] border-accent/40 text-accent hover:bg-accent/10"
            onClick={handleActionComplete}
          >
            <Zap className="w-3 h-3 mr-0.5" />
            ACTION
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default ServedNotification;


export const useCommandFailureNotifier = () => {
  const { user } = useAuth();
  
  const notifyCommandFailed = useCallback(async (
    serve: ServeAction,
    members: User[],
    squadId?: string
  ) => {
    if (!user?.id) return;
    
    try {
      if (!isNotificationEnabled('failedCommands')) {
        console.log('Failed command notifications are disabled, skipping');
        return;
      }

      const from = members.find(m => m.id === serve.fromUserId);
      const to = members.find(m => m.id === serve.toUserId);
      
      // ONLY notify the commander - main notification handled in GroupDetailPage
      if (serve.fromUserId && serve.fromUserId !== user.id) {
        const targetName = to?.username || 'Someone';
        await notificationTriggers.triggerFailedCommand(
          serve.fromUserId,
          targetName,
          serve.prompt.substring(0, 30) + '...',
          serve.id
        );
      }
    } catch (error) {
      console.error('Failed to send command failure notifications:', error);
    }
  }, [user?.id]);
  
  return { notifyCommandFailed };
};

/**
 * Hook to handle action used notifications
 */
export const useActionNotifier = () => {
  const { user } = useAuth();
  
  const notifyActionUsed = useCallback(async (
    serve: ServeAction,
    members: User[],
    actionName: string
  ) => {
    if (!user?.id) return;
    
    try {
      const isLegendary = !!serve.isLegendary;
      const notificationType = isLegendary ? 'superActionsAgainstYou' : 'actionCreditsAgainstYou';
      
      if (!isNotificationEnabled(notificationType as any)) {
        console.log(`${notificationType} notifications are disabled, skipping`);
        return;
      }

      const to = members.find(m => m.id === serve.toUserId);
      const targetName = to?.username || 'Someone';
      
      if (isLegendary) {
        await notificationTriggers.triggerSuperActionUsed(
          user.id,
          targetName,
          actionName,
          serve.id
        );
      } else {
        await notificationTriggers.triggerActionUsed(
          user.id,
          targetName,
          actionName,
          serve.id
        );
      }
    } catch (error) {
      console.error('Failed to send action used notification:', error);
    }
  }, [user?.id]);
  
  return { notifyActionUsed };
};

/**
 * Hook to handle command completion notifications
 */
export const useCommandCompletionNotifier = () => {
  const { user } = useAuth();
  
  const notifyCommandCompleted = useCallback(async (
    serve: ServeAction,
    members: User[]
  ) => {
    if (!user?.id) return;
    
    try {
      if (!isNotificationEnabled('failedCommands')) {
        console.log('Failed command notifications are disabled, skipping');
        return;
      }

      const from = members.find(m => m.id === serve.fromUserId);
      const targetName = from?.username || 'Someone';
      
      // ONLY notify the commander - main notification handled in GroupDetailPage
      if (serve.fromUserId && serve.fromUserId !== user.id) {
        await notificationTriggers.triggerFailedCommand(
          serve.fromUserId,
          targetName,
          serve.prompt.substring(0, 30) + '...',
          serve.id
        );
      }
    } catch (error) {
      console.error('Failed to send command completion notification:', error);
    }
  }, [user?.id]);
  
  return { notifyCommandCompleted };
};