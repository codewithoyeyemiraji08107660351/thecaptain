import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shuffle, UserPlus, Loader2, Mail, Search } from "lucide-react";
import { playShuffleSound, playButtonSound } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const randomUsernames = [
  "shadow_ops", "steel_fox", "iron_wave", "ghost_helm", "dark_tide",
  "storm_rider", "night_hawk", "war_eagle", "sea_wolf", "thunder_bolt",
];

const SignupDialog = ({ open, onOpenChange }: SignupDialogProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameChecked, setUsernameChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  const [hasTypedUsername, setHasTypedUsername] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoGenerate = async () => {
    playShuffleSound();
    let name = randomUsernames[Math.floor(Math.random() * randomUsernames.length)];
    name += Math.floor(Math.random() * 999);
    if (name.length > 15) name = name.slice(0, 15);
    setUsername(name);
    setHasTypedUsername(false);
    setUsernameError("");
    // Auto-check availability for generated names
    setChecking(true);
    const { data: available } = await supabase.rpc("check_username_available", { _username: name.trim() });
    setUsernameChecked(true);
    if (available === false) {
      setUsernameError("Username is unavailable");
    } else {
      setUsernameError("");
    }
    setChecking(false);
  };

  const handleUsernameChange = (val: string) => {
    if (val.length > 15) return;
    setUsername(val);
    setUsernameChecked(false);
    setUsernameError("");
    setHasTypedUsername(val.length > 0);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length >= 2) {
      setChecking(true);
      debounceRef.current = setTimeout(async () => {
        const { data: available } = await supabase.rpc("check_username_available", { _username: val.trim() });
        setUsernameChecked(true);
        if (available === false) {
          setUsernameError("Username is unavailable");
        } else {
          setUsernameError("");
        }
        setChecking(false);
      }, 400);
    } else {
      setChecking(false);
    }
  };

  const checkUsername = async () => {
    if (!username.trim() || username.trim().length < 2) return;
    playButtonSound();
    setChecking(true);
    const { data: available } = await supabase.rpc("check_username_available", { _username: username.trim() });
    setUsernameChecked(true);
    if (available === false) {
      setUsernameError("Username is unavailable");
    } else {
      setUsernameError("");
    }
    setChecking(false);
  };

  const handleSignup = async () => {
    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || !password.trim()) return;
    if (usernameError || !usernameChecked) return;

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        data: {
          username: username.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/email-verified`,
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setShowVerifyPrompt(true);
  };

  const handleCloseVerify = () => {
    setShowVerifyPrompt(false);
    onOpenChange(false);
    setFirstName("");
    setLastName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setUsernameChecked(false);
    setHasTypedUsername(false);
  };

  const isValid = firstName.trim() && lastName.trim() && username.trim() && email.trim() && password.trim() && !usernameError && usernameChecked;

  if (showVerifyPrompt) {
    return (
      <Dialog open={open} onOpenChange={() => handleCloseVerify()}>
        <DialogContent className="bg-card border-border max-w-sm" onInteractOutside={() => handleCloseVerify()}>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold mb-3 text-foreground">Check Your Email</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Please check your email to verify your account. Once verified, you can deploy and join the battle.
            </p>
            <Button variant="outline" onClick={handleCloseVerify} className="px-8">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-primary" />
            Join The Ranks
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">First Name</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" className="bg-secondary/50 border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last Name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" className="bg-secondary/50 border-border mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Username</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                placeholder="shadow_ops"
                maxLength={15}
                className={`bg-secondary/50 border-border flex-1 ${usernameError ? "border-destructive" : ""}`}
              />
              <Button variant="outline" size="icon" onClick={autoGenerate} disabled={checking} title="Auto-generate">
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
              </Button>
            </div>
            {usernameChecked && !usernameError && (
              <p className="text-xs text-success mt-1">✅ Username is available!</p>
            )}
            {usernameError && <p className="text-xs text-destructive mt-1">❌ {usernameError}!</p>}
            <p className="text-xs text-muted-foreground mt-1">{username.length}/15 characters</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="bg-secondary/50 border-border mt-1" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="bg-secondary/50 border-border mt-1" />
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="/terms" target="_blank" className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline">Terms & Conditions</a>
            <a href="/privacy" target="_blank" className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline">Privacy Policy</a>
            <a href="/community-guidelines" target="_blank" className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline">Community Guidelines</a>
            <a href="/safety-disclaimer" target="_blank" className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline">Safety Disclaimer</a>
          </div>

          <Button variant="hero" className="w-full py-5 text-lg mt-2" disabled={!isValid || loading} onClick={handleSignup}>
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UserPlus className="w-5 h-5 mr-2" />}
            Enlist Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignupDialog;
