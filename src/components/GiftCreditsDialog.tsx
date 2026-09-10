// src/components/GiftCreditsDialog.tsx
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { playButtonSound } from "@/lib/sounds";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";
import type { User } from "@/lib/mockData";

interface GiftCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: User | null;
  senderCredits: number;
  senderId: string;
  senderName?: string;
  onSuccess?: (amount: number) => void | Promise<void>;
}

const GIFT_AMOUNTS = [1, 2, 3, 5];

const GiftCreditsDialog = ({ 
  open, 
  onOpenChange, 
  recipient, 
  senderCredits, 
  senderId, 
  senderName,
  onSuccess 
}: GiftCreditsDialogProps) => {
  const [amount, setAmount] = useState(1);
  const [sending, setSending] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  
  const giftInProgressRef = useRef(false);
  const amountChangeDebounceRef = useRef(false);
  const giftIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // ✅ Track if notification was already sent for this gift
  const notificationSentRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAmount(1);
      setNotificationSent(false);
      giftIdRef.current = null;
    }
  }, [open]);

  // ✅ Reset notification tracking when recipient changes
  useEffect(() => {
    if (recipient?.id) {
      // Clear notification tracking for new recipient
      notificationSentRef.current.clear();
    }
  }, [recipient?.id]);

  if (!recipient) return null;

  const canSend = senderCredits >= amount && recipient.id !== senderId && !sending && !giftInProgressRef.current;

  const handleAmountChange = (newAmount: number) => {
    if (sending || giftInProgressRef.current) return;
    if (amountChangeDebounceRef.current) return;
    amountChangeDebounceRef.current = true;
    
    playButtonSound();
    setAmount(newAmount);
    
    setTimeout(() => {
      amountChangeDebounceRef.current = false;
    }, 300);
  };

  const handleSend = async () => {
    // ✅ Prevent multiple gift requests
    if (giftInProgressRef.current) {
      console.log('⚠️ Gift already in progress, please wait');
      toast.info("Gift is already being processed. Please wait...");
      return;
    }
    
    if (!canSend || sending) {
      if (recipient.id === senderId) {
        toast.error("You can't gift credits to yourself!");
      } else if (senderCredits < amount) {
        toast.error("You don't have enough Action Credits. Visit the shop to top up.");
      }
      return;
    }
    
    playButtonSound();
    setSending(true);
    
    // ✅ Generate a unique gift ID for deduplication
    const giftId = `${senderId}_${recipient.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    giftIdRef.current = giftId;
    
    giftInProgressRef.current = true;
    setNotificationSent(false);
    
    try {
      // ✅ Call the RPC to gift credits
      const { error } = await (supabase.rpc as any)("gift_action_credits", {
        _recipient_id: recipient.id,
        _amount: amount,
      });

      if (error) {
        if (error.message?.includes("Insufficient")) {
          toast.error("You don't have enough Action Credits. Visit the shop to top up.");
        } else if (error.message?.includes("Cannot gift to yourself")) {
          toast.error("You can't gift credits to yourself!");
        } else {
          toast.error("Failed to send gift: " + error.message);
        }
        return;
      }

      toast.success(`✅ ${amount} Action Credit${amount > 1 ? "s" : ""} sent to ${recipient.username}!`);
      
      // ✅ Send notification with proper deduplication
      const notificationKey = `${recipient.id}_${giftId}`;
      
      // ✅ Only send notification if it hasn't been sent for this gift
      if (isNotificationEnabled("creditGifting") && !notificationSentRef.current.has(notificationKey)) {
        const displayName = senderName || "Someone";
        
        try {
          const notificationResult = await notificationTriggers.triggerCreditGifting(
            recipient.id,
            displayName,
            amount,
            giftId // ✅ Pass the unique gift ID as transactionId
          );
          
          if (notificationResult) {
            setNotificationSent(true);
            notificationSentRef.current.add(notificationKey);
            console.log(`✅ Credit gifting notification sent for gift: ${giftId}`);
          } else {
            console.log(`ℹ️ Credit gifting notification skipped (disabled or already sent)`);
          }
        } catch (notificationError) {
          console.error('Failed to send credit gifting notification:', notificationError);
        }
      } else {
        if (!isNotificationEnabled("creditGifting")) {
          console.log('ℹ️ Credit gifting notifications are disabled by user');
        } else {
          console.log(`ℹ️ Notification already sent for gift: ${notificationKey}`);
        }
      }
      
      // ✅ Call onSuccess callback to refresh UI
      if (onSuccess) {
        await onSuccess(amount);
      }
      
      // ✅ Reset amount and close dialog on success
      setAmount(1);
      onOpenChange(false);
      
    } catch (error) {
      console.error('Gift error:', error);
      toast.error("Failed to send gift. Please try again.");
    } finally {
      if (mountedRef.current) {
        setSending(false);
        giftInProgressRef.current = false;
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !sending && !giftInProgressRef.current) {
      setAmount(1);
      setNotificationSent(false);
      giftIdRef.current = null;
      onOpenChange(open);
    } else if (!open) {
      toast.info("Please wait, gift is being processed...");
    } else {
      onOpenChange(open);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center justify-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Gift Credits
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-5">
          {/* Recipient */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-4xl invert-protect">{recipient.avatar}</span>
            <p className="font-display font-bold">{recipient.username}</p>
          </div>

          {/* Amount Selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Select amount to gift</p>
            <div className="flex gap-2 justify-center">
              {GIFT_AMOUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => handleAmountChange(n)}
                  className={`w-12 h-12 rounded-xl font-bold text-sm transition-all ${
                    amount === n
                      ? "bg-primary text-primary-foreground shadow-lg scale-110"
                      : "bg-secondary/50 border border-border hover:border-primary/40"
                  }`}
                  disabled={senderCredits < n || sending || giftInProgressRef.current}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Balance */}
          <p className="text-xs text-muted-foreground">
            Your balance: <span className="font-bold text-accent">{senderCredits}</span> Action Credit{senderCredits !== 1 ? "s" : ""}
          </p>

          {senderCredits < amount && (
            <p className="text-xs text-destructive">You don't have enough Action Credits. Visit the shop to top up.</p>
          )}

          {recipient.id === senderId && (
            <p className="text-xs text-destructive">You cannot gift credits to yourself!</p>
          )}

          {/* ✅ Show notification status */}
          {notificationSent && !sending && (
            <p className="text-xs text-green-500 flex items-center justify-center gap-1">
              <span>✅</span> Notification sent to recipient
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              className="flex-1" 
              onClick={() => handleOpenChange(false)}
              disabled={sending || giftInProgressRef.current}
            >
              Cancel
            </Button>
            <Button
              variant="serve"
              className="flex-1"
              disabled={!canSend || sending || giftInProgressRef.current}
              onClick={handleSend}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-1" />
                  Send {amount} Credit{amount > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
          
          {/* Processing indicator */}
          {giftInProgressRef.current && (
            <p className="text-xs text-muted-foreground animate-pulse">
              Processing gift, please wait...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GiftCreditsDialog;