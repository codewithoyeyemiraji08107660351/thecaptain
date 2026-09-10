import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, CreditCard, ArrowLeft, Crown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEV_FREE_FULL_VERSION } from "@/lib/dev-config";
import { useAuth } from "@/contexts/AuthContext";
import { usePurchase } from "@/contexts/PurchaseContext";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchaseComplete?: () => Promise<void> | void;
}

const UpgradeDialog = ({ open, onOpenChange, onPurchaseComplete }: UpgradeDialogProps) => {
  const { user } = useAuth();
  const { purchaseProduct, refreshPremiumStatus, isLoading: purchaseLoading } = usePurchase();
  const [showPayment, setShowPayment] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);

  // FIX: Handle one-time purchase for Full Version
  const handlePurchase = async () => {
    if (!user?.id) {
      toast.error("Please log in to upgrade");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      // Web fallback - show payment form
      setShowPayment(true);
      return;
    }

    setProcessing(true);
    
    try {
      // FIX: Purchase one-time Full Version through RevenueCat
      const success = await purchaseProduct('the_captain_full_version');
      
      if (success) {
        // Refresh premium status with retry
        let isNowPremium = false;
        for (let i = 0; i < 3; i++) {
          const premium = await refreshPremiumStatus();
          if (premium) {
            isNowPremium = true;
            break;
          }
          if (i < 2) await new Promise(r => setTimeout(r, 1500));
        }
        
        if (isNowPremium) {
          toast.success("Full Version unlocked! 🎉");
        } else {
          toast.warning("Purchase successful! Full Version access may take a moment.");
        }
        
        // Notify parent
        await onPurchaseComplete?.();
        onOpenChange(false);
      } else {
        toast.error("Purchase failed. Please try again.");
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error("Purchase failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpgrade = () => {
    if (DEV_FREE_FULL_VERSION) {
      // Free purchase in dev mode
      setProcessing(true);
      setTimeout(async () => {
        await onPurchaseComplete?.();
        setProcessing(false);
        onOpenChange(false);
      }, 500);
      return;
    }
    
    // Show payment options directly on native
    if (Capacitor.isNativePlatform()) {
      // On native, trigger purchase directly
      handlePurchase();
    } else {
      // On web, show payment form
      setShowPayment(true);
    }
  };

  const handlePay = () => {
    setProcessing(true);
    setTimeout(async () => {
      await onPurchaseComplete?.();
      setProcessing(false);
      setShowPayment(false);
      onOpenChange(false);
    }, 2000);
  };

  const handleBack = () => {
    setShowPayment(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setShowPayment(false); onOpenChange(v); }}>
      <DialogContent className="bg-card border-border max-w-sm text-center">
        {!showPayment ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-display flex items-center justify-center gap-2">
                <Crown className="w-6 h-6 text-primary" />
                Full Version
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="text-center">
                <div className="text-4xl font-display font-bold text-gradient-primary">
                  {DEV_FREE_FULL_VERSION ? "FREE" : "$1.99"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">One-time purchase · Lifetime access</p>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {DEV_FREE_FULL_VERSION ? "Free during testing period." : "Unlock everything with a single purchase"}
              </p>

              <div className="space-y-2 text-left bg-secondary/50 rounded-xl p-4">
                {[
                  "Unlimited squads",
                  "Custom squad themes (Admin only)",
                  "Profile lifetime stats — detailed breakdown across all squads",
                  "Username changes (once every 30 days)",
                  "Priority access to new features",
                  "Squad reordering",
                ].map(feature => (
                  <div key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
                <div className="border-t border-border mt-3 pt-3">
                  <p className="text-xs text-muted-foreground">Free version: 1 squad, no themes or stats</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button 
                  variant="hero" 
                  className="w-full" 
                  size="lg" 
                  onClick={handleUpgrade}
                  disabled={processing || purchaseLoading}
                >
                  {processing || purchaseLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4 mr-2" />
                  )}
                  {processing || purchaseLoading ? "Processing..." : `Buy Full Version • ${DEV_FREE_FULL_VERSION ? "FREE" : "$1.99"}`}
                </Button>
              </div>

              {/* FIX: Removed subscription footer since there are no subscriptions */}
              <p className="text-[10px] text-muted-foreground">
                One-time payment · No recurring charges
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-display flex items-center gap-2">
                <button onClick={handleBack} className="hover:text-primary transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <CreditCard className="w-5 h-5 text-primary" />
                Payment
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4 text-left">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">The Captain — Full Version</p>
                <p className="text-2xl font-display font-bold text-gradient-primary">$1.99</p>
                <p className="text-xs text-muted-foreground">One-time purchase · Lifetime access</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Card Number</Label>
                <Input
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  className="bg-secondary/50 border-border mt-1"
                  maxLength={19}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Expiry</Label>
                  <Input
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                    className="bg-secondary/50 border-border mt-1"
                    maxLength={5}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">CVC</Label>
                  <Input
                    placeholder="123"
                    value={cvc}
                    onChange={e => setCvc(e.target.value)}
                    className="bg-secondary/50 border-border mt-1"
                    maxLength={4}
                  />
                </div>
              </div>

              <Button
                variant="hero"
                className="w-full"
                size="lg"
                onClick={handlePay}
                disabled={processing || !cardNumber || !expiry || !cvc}
              >
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {processing ? "Processing..." : "Pay $1.99"}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Secure payment · Your card details are encrypted · One-time charge
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeDialog;