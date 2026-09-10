import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotInput, setForgotInput] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const resolveEmail = async (input: string): Promise<string | null> => {
    const trimmed = input.trim();
    if (trimmed.includes("@")) return trimmed;

    // Resolve username to email via edge function
    const { data, error } = await supabase.functions.invoke("get-email-by-username", {
      body: { username: trimmed.toLowerCase() },
    });

    if (error || !data?.email) {
      toast.error("No account found with that username");
      return null;
    }
    return data.email;
  };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;

    setLoading(true);
    const email = await resolveEmail(identifier);
    if (!email) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    });
    setLoading(false);

    if (error) {
      // Check if the error is because email is not confirmed
      if (error.message.toLowerCase().includes("email not confirmed")) {
        toast.error("Please verify your email before signing in. Check your inbox for a verification link.", { duration: 6000 });
        return;
      }
      toast.error(error.message);
      return;
    }

    onOpenChange(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotInput.trim()) return;
    setForgotLoading(true);

    let emailToReset = forgotInput.trim();

    if (!emailToReset.includes("@")) {
      // Use edge function to send reset email by username
      const { data: fnData, error: fnError } = await supabase.functions.invoke("reset-password-by-username", {
        body: { username: emailToReset.toLowerCase() },
      });

      setForgotLoading(false);

      if (fnError || (fnData && fnData.error)) {
        toast.error(fnData?.error || "No account found with that username. Please try your email address instead.");
        return;
      }

      toast.success("Password reset email sent! Check your inbox.");
      setShowForgot(false);
      setForgotInput("");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setForgotLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Password reset email sent! Check your inbox.");
    setShowForgot(false);
    setForgotInput("");
  };

  if (showForgot) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" />
              Reset Password
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Enter your email address or username and we'll send you a link to reset your password.
            </p>

            <div>
              <Label className="text-xs text-muted-foreground">Email or Username</Label>
              <Input
                value={forgotInput}
                onChange={e => setForgotInput(e.target.value)}
                placeholder="john@example.com or shadow_ops"
                className="bg-secondary/50 border-border mt-1"
              />
            </div>

            <Button
              variant="serve"
              className="w-full py-5 text-lg"
              disabled={!forgotInput.trim() || forgotLoading}
              onClick={handleForgotPassword}
            >
              {forgotLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <KeyRound className="w-5 h-5 mr-2" />}
              Send Reset Link
            </Button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => { setShowForgot(false); setForgotInput(""); }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <LogIn className="w-6 h-6 text-accent" />
            Deploy
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Email or Username</Label>
            <Input
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="john@example.com or shadow_ops"
              className="bg-secondary/50 border-border mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="bg-secondary/50 border-border mt-1" />
          </div>

          <p className="text-[10px] text-muted-foreground text-center leading-snug px-0">
            Commands in The Captain are created by players. Always use common sense and never perform tasks that could cause harm.
          </p>

          <Button variant="serve" className="w-full py-5 text-lg" disabled={!identifier.trim() || !password.trim() || loading} onClick={handleLogin}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
            Deploy
          </Button>

          <button
            onClick={() => setShowForgot(true)}
            className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Forgot my password
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
