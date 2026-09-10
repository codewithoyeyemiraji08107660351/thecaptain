import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Zap, Crown, Gift } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";

interface CreditAwardPromptProps {
  open: boolean;
  type: "action" | "super_action";
  onDismiss: () => void;
}

const CreditAwardPrompt = ({ open, type, onDismiss }: CreditAwardPromptProps) => {
  const isSuper = type === "super_action";
  const { user, profile } = useAuth();
  
  // ✅ Track if notification was already sent for this specific award
  const notificationSentRef = useRef(false);
  
  // ✅ Generate a unique award ID for this specific award event
  const awardId = `${type}_${user?.id}_${new Date().toISOString().split('T')[0]}`;

  useEffect(() => {
    // ✅ Reset notification sent state when dialog closes
    if (!open) {
      notificationSentRef.current = false;
      return;
    }

    // ✅ Check if user is authenticated
    if (!user?.id) {
      console.warn('CreditAwardPrompt: No user ID available, skipping notification');
      return;
    }

    // ✅ Check if notification was already sent for this award
    if (notificationSentRef.current) {
      console.log('CreditAwardPrompt: Notification already sent for this award');
      return;
    }

    // ✅ Check if credit gifting notifications are enabled using the new settings
    // The setting key is 'creditGifting' in NotificationSettings
    const creditNotificationsEnabled = isNotificationEnabled('creditGifting');
    
    if (!creditNotificationsEnabled) {
      console.log('CreditAwardPrompt: Credit gifting notifications are disabled by user');
      return;
    }

    // ✅ Send notification
    const sendAwardNotification = async () => {
      try {
        console.log(`CreditAwardPrompt: Sending ${type} award notification to user ${user.id}`);
        
       
        await notificationTriggers.triggerCreditGifting(
          user.id,
          "The Captain",
          isSuper ? 1 : 1,
          awardId 
        );
        
        // ✅ Mark as sent
        notificationSentRef.current = true;
        console.log(`CreditAwardPrompt: ${type} award notification sent successfully`);
        
      } catch (error) {
        console.error(`CreditAwardPrompt: Failed to send ${type} award notification:`, error);
        // ✅ Don't mark as sent on error - allow retry
      }
    };

    // ✅ Send notification with a small delay to ensure dialog is mounted
    const timeoutId = setTimeout(() => {
      sendAwardNotification();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [open, user?.id, isSuper, awardId, type]);

  // ✅ Handle manual retry if notification fails
  const handleRetryNotification = async () => {
    if (!user?.id) return;
    
    try {
      console.log(`CreditAwardPrompt: Manual retry for ${type} award notification`);
      notificationSentRef.current = false; // Reset to allow retry
      
      await notificationTriggers.triggerCreditGifting(
        user.id,
        "The Captain",
        isSuper ? 1 : 1,
        awardId
      );
      
      notificationSentRef.current = true;
      console.log(`CreditAwardPrompt: Manual retry successful`);
    } catch (error) {
      console.error(`CreditAwardPrompt: Manual retry failed:`, error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="bg-card border-border max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="text-lg font-display flex items-center justify-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Free Credit Awarded!
          </DialogTitle>
        </DialogHeader>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="py-4 flex flex-col items-center gap-3"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{
              background: isSuper ? "hsl(270 80% 60% / 0.15)" : "hsl(var(--accent) / 0.15)",
              border: `2px solid ${isSuper ? "hsl(270 80% 60% / 0.3)" : "hsl(var(--accent) / 0.3)"}`,
            }}
          >
            {isSuper ? <Crown className="w-8 h-8" style={{ color: "hsl(270 80% 60%)" }} /> : <Zap className="w-8 h-8 text-accent" />}
          </div>
          <p className="text-sm text-muted-foreground">
            The developers have gifted you
          </p>
          <p className="text-xl font-display font-bold" style={{ color: isSuper ? "hsl(270 80% 60%)" : undefined }}>
            {isSuper ? "1 Super Action Credit" : "1 Action Credit"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isSuper
              ? "It's been 45 days — here's a free Super Action on us! 🎁"
              : "It's been 30 days — here's a free Action on us! 🎁"}
          </p>
          
          {/* ✅ Silent retry button - only visible in development */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={handleRetryNotification}
              className="text-xs text-muted-foreground hover:text-foreground underline mt-2"
              type="button"
            >
              Retry Notification
            </button>
          )}
        </motion.div>
        <Button variant="hero" className="w-full" onClick={onDismiss}>
          Thanks! 🙏
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default CreditAwardPrompt;