import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SAFETY_ACCEPTED_KEY = "captain-safety-disclaimer-accepted";

export const hasSafetyDisclaimerAccepted = () => {
  return localStorage.getItem(SAFETY_ACCEPTED_KEY) === "true";
};

const SafetyDisclaimerModal = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSafetyDisclaimerAccepted()) {
      setOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(SAFETY_ACCEPTED_KEY, "true");
    setOpen(false);
  };

  const handleDecline = async () => {
    localStorage.removeItem(SAFETY_ACCEPTED_KEY);
    await supabase.auth.signOut();
    setOpen(false);
    window.location.href = "/";
  };

  return (
    <Dialog open={open} onOpenChange={() => {/* prevent closing without accepting */}}>
      <DialogContent className="bg-card border-border max-w-md [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-accent" />
            Safety Disclaimer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 text-sm text-foreground/90 leading-relaxed">
          <p>
            <strong>The Captain</strong> is a social entertainment game where players may issue commands or challenges to other players.
          </p>

          <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
            <p className="font-bold text-foreground">By continuing, you acknowledge that:</p>
            <ul className="list-disc list-inside space-y-1 ml-1 text-muted-foreground">
              <li>All commands and challenges are <strong className="text-foreground">created by users</strong></li>
              <li>The App <strong className="text-foreground">does not verify or approve</strong> challenges</li>
              <li>Participation is <strong className="text-foreground">entirely voluntary</strong></li>
              <li>You may <strong className="text-foreground">decline any command at any time</strong></li>
              <li>You participate <strong className="text-foreground">at your own risk</strong></li>
            </ul>
          </div>

          <p className="text-muted-foreground text-xs">
            <em>The App and its owner are not responsible for personal injury, property damage, financial loss, or any consequences arising from user-created challenges. Please exercise good judgment and never perform tasks that could cause harm.</em>
          </p>

          <div className="flex gap-3">
            <Button variant="destructive" className="flex-1 py-5 text-base" onClick={handleDecline}>
              <XCircle className="w-5 h-5 mr-2" />
              I Decline
            </Button>
            <Button variant="serve" className="flex-1 py-5 text-base" onClick={handleAccept}>
              <ShieldAlert className="w-5 h-5 mr-2" />
              I Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SafetyDisclaimerModal;
