import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import UpgradeDialog from "@/components/UpgradeDialog";
import { 
  getPendingInvite, 
  clearPendingInvite 
} from "@/utils/inviteStorage";

interface InviteHandlerProps {
  onAccepted?: () => void;
}

const InviteHandler = ({ onAccepted }: InviteHandlerProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [squadId, setSquadId] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [processingInvite, setProcessingInvite] = useState(false);

  const isPremium = (profile as any)?.is_premium ?? false;

  const handlePurchaseComplete = async () => {
    if (!user?.id) return;
    
    try {
      const { error } = await supabase.rpc("grant_premium");
      if (error) {
        toast.error(`Upgrade failed: ${error.message}`);
        return;
      }
      await refreshProfile();
      toast.success("Full version activated!");
      
      // After successful upgrade, try to accept the invite again
      setShowUpgrade(false);
      
      // Small delay to ensure premium status is updated
      setTimeout(() => {
        setOpen(true);
      }, 500);
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error("Upgrade failed. Please try again.");
    }
  };

  useEffect(() => {
    if (!user) return;
    if (processingInvite) return;

    const lookup = async () => {
      try {
        setProcessingInvite(true);
        
        const code = await getPendingInvite();
        
        if (!code) {
          console.log("No pending invite found");
          return;
        }

        const normalizedCode = code.trim().toUpperCase();
        setInviteCode(normalizedCode);
        
        console.log("🔍 Looking up invite:", normalizedCode);

        const { data: squad, error } = await supabase
          .rpc("lookup_squad_by_invite_code", { 
            _invite_code: normalizedCode 
          })
          .maybeSingle();

        if (error || !squad) {
          console.error("Squad lookup error:", error);
          toast.error("Invalid or expired invite code");
          await clearPendingInvite();
          return;
        }

        // Check if already a member
        const { data: existing } = await supabase
          .from("squad_members")
          .select("id")
          .eq("squad_id", squad.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          toast.info("You're already in this squadron!");
          await clearPendingInvite();
          navigate(`/group/${squad.id}`);
          return;
        }

        setSquadName(squad.name);
        setSquadId(squad.id);
        setOpen(true);
      } catch (error) {
        console.error("Error processing invite:", error);
        toast.error("Failed to process invite");
      } finally {
        setProcessingInvite(false);
      }
    };

    lookup();
  }, [user, navigate]);

  const handleAccept = async () => {
    if (!user || !squadId) return;

    // Check if free user already in a group
    if (!isPremium) {
      const { data: mySquads } = await supabase
        .from("squad_members")
        .select("id")
        .eq("user_id", user.id);

      if (mySquads && mySquads.length >= 1) {
        // Free user already in a squad — show upgrade
        setOpen(false);
        setShowUpgrade(true);
        return;
      }
    }

    setLoading(true);

    try {
      await supabase.rpc("reset_profile_for_squad_join");

      const { error } = await supabase
        .from("squad_members")
        .insert({ squad_id: squadId, user_id: user.id });

      if (error) {
        toast.error("Failed to join: " + error.message);
        return;
      }

      await clearPendingInvite();
      setOpen(false);
      toast.success(`Welcome to ${squadName}!`);
      onAccepted?.();
      navigate(`/group/${squadId}`);
    } catch (error) {
      console.error("Error joining squad:", error);
      toast.error("Failed to join squad. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    await clearPendingInvite();
    setOpen(false);
    toast.info("Invitation declined");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleDecline(); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <Users className="w-8 h-8 text-primary" />
            </div>

            <h2 className="text-xl font-display font-bold mb-3 text-foreground">
              Squadron Invitation
            </h2>

            <p className="text-muted-foreground text-sm mb-6">
              You have been invited to join the squadron:
            </p>

            <p className="text-lg font-display font-bold text-primary mb-6">
              {squadName}
            </p>

            <p className="text-muted-foreground text-sm mb-6">
              Do you accept?
            </p>

            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-2" />
                Decline
              </Button>
              <Button
                variant="hero"
                className="flex-1"
                onClick={handleAccept}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Accept
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <UpgradeDialog 
        open={showUpgrade} 
        onOpenChange={(v) => {
          setShowUpgrade(v);
          if (!v) clearPendingInvite();
        }}
        onPurchaseComplete={handlePurchaseComplete}
      />
    </>
  );
};

export default InviteHandler;

export { savePendingInvite, getPendingInvite, clearPendingInvite } from "@/utils/inviteStorage";