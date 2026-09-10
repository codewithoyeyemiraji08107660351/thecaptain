import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Anchor, KeyRound, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from the auth hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check hash for recovery type
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSuccess(true);
  };

  const handleReturn = () => {
    window.location.href = "/";
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative bg-background">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-md w-full"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-8"
          >
            <CheckCircle className="w-10 h-10 text-primary" />
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight mb-4 text-foreground">
            Password Successfully Updated
          </h1>

          <p className="text-muted-foreground text-base sm:text-lg mb-8">
            Please return to the app to deploy with your new password.
          </p>

          <Button
            variant="hero"
            size="lg"
            className="text-lg px-10 py-6"
            onClick={handleReturn}
          >
            <Anchor className="w-5 h-5 mr-2" />
            Return to Base
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative bg-background">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-md w-full"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-8"
        >
          <KeyRound className="w-10 h-10 text-primary" />
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight mb-4 text-foreground">
          Reset Password
        </h1>

        <p className="text-muted-foreground text-base mb-8">
          Enter your new password below.
        </p>

        <div className="space-y-4 text-left">
          <div>
            <Label className="text-xs text-muted-foreground">New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-secondary/50 border-border mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-secondary/50 border-border mt-1"
            />
          </div>

          <Button
            variant="hero"
            size="lg"
            className="w-full text-lg py-6"
            disabled={!password.trim() || !confirmPassword.trim() || loading || !ready}
            onClick={handleReset}
          >
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <KeyRound className="w-5 h-5 mr-2" />}
            Save New Password
          </Button>

          {!ready && (
            <p className="text-xs text-muted-foreground text-center">
              Loading recovery session...
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;
