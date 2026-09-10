import { useState } from "react"; 
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Users, Loader2, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { playButtonSound } from "@/lib/sounds";
import UpgradeDialog from "@/components/UpgradeDialog";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateGroupDialog = ({ open, onOpenChange }: CreateGroupDialogProps) => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isPremium = (profile as any)?.is_premium ?? false;

  const handleUpgradeSuccess = async () => {
    if (!user?.id) return;
    
    try {
      // Use type assertion for RPC call
      const { error } = await supabase.rpc("grant_premium");

      if (error) {
        toast.error(`Upgrade failed: ${error.message}`);
        return;
      }

      await refreshProfile();
      toast.success("Full version activated.");
      setShowUpgrade(false);
      // Re-show dialog after upgrade
      onOpenChange(true);
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error("Upgrade failed. Please try again.");
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    playButtonSound();
    setLoading(true);

    try {
      // Use type assertion to bypass TypeScript's type checking
      // The actual database has these tables
      const { data: squad, error: squadError } = await (supabase
        .from("squads")
        .insert({ name: name.trim(), admin_id: user.id })
        .select()
        .single() as any);

      if (squadError || !squad) {
        toast.error(squadError?.message || "Failed to create squad");
        setLoading(false);
        return;
      }

      const { error: memberError } = await (supabase
        .from("squad_members")
        .insert({ squad_id: squad.id, user_id: user.id, is_captain: true }) as any);

      if (memberError) {
        toast.error(memberError.message);
        setLoading(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["user-squads"] });
      setName("");
      setLoading(false);
      onOpenChange(false);
      navigate(`/group/${squad.id}`);
    } catch (error: any) {
      console.error('Create squad error:', error);
      toast.error(error.message || "Failed to create squad");
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) return;
    playButtonSound();
    setJoinLoading(true);

    try {
      // Use type assertion for RPC call
      const { data: squad, error } = await (supabase
        .rpc("lookup_squad_by_invite_code", { _invite_code: joinCode.trim().toUpperCase() })
        .maybeSingle() as any);

      if (error || !squad) {
        toast.error("Invalid or expired invite code");
        setJoinLoading(false);
        return;
      }

      // Check if already a member
      const { data: existing } = await (supabase
        .from("squad_members")
        .select("id")
        .eq("squad_id", squad.id)
        .eq("user_id", user.id)
        .maybeSingle() as any);

      if (existing) {
        toast.info("You're already in this squadron!");
        setJoinLoading(false);
        onOpenChange(false);
        navigate(`/group/${squad.id}`);
        return;
      }

      // Check free user limit
      if (!isPremium) {
        const { data: mySquads } = await (supabase
          .from("squad_members")
          .select("id")
          .eq("user_id", user.id) as any);

        if (mySquads && mySquads.length >= 1) {
          setJoinLoading(false);
          onOpenChange(false);
          setShowUpgrade(true);
          return;
        }
      }

      // Reset strikes/warnings/consecutive_fails/rank for a clean slate when joining
      await (supabase.rpc("reset_profile_for_squad_join") as any);

      const { error: joinError } = await (supabase
        .from("squad_members")
        .insert({ squad_id: squad.id, user_id: user.id }) as any);

      if (joinError) {
        toast.error("Failed to join: " + joinError.message);
        setJoinLoading(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["user-squads"] });
      setJoinCode("");
      setJoinLoading(false);
      onOpenChange(false);
      toast.success(`Welcome to ${squad.name}!`);
      navigate(`/group/${squad.id}`);
    } catch (error: any) {
      console.error('Join squad error:', error);
      toast.error(error.message || "Failed to join squad");
      setJoinLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              {mode === "create" ? "Create Squad" : "Join Squad"}
            </DialogTitle>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-2">
            <Button
              variant={mode === "create" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("create")}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
            <Button
              variant={mode === "join" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("join")}
            >
              <LogIn className="w-4 h-4 mr-1" />
              Join
            </Button>
          </div>

          {mode === "create" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground italic text-center">
                To create a more enjoyable experience, please create the squad with a fair &amp; honest Admin
              </p>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Squad Name</label>
                <Input
                  placeholder="Friday Night Crew"
                  value={name}
                  onChange={e => { if (e.target.value.length <= 20) setName(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                  className="bg-secondary/50 border-border"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground mt-1">{name.length}/20 characters</p>
              </div>
              <Button variant="hero" className="w-full py-5 text-lg" disabled={!name.trim() || loading} onClick={handleCreate}>
                {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
                Create Squad
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Squad Invite Code</label>
                <Input
                  placeholder="e.g. 3ED93867"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  className="bg-secondary/50 border-border font-mono tracking-widest text-center"
                  maxLength={8}
                />
                <p className="text-xs text-muted-foreground mt-1">Enter the 8-character code shared by the squad admin</p>
              </div>
              <Button variant="hero" className="w-full py-5 text-lg" disabled={!joinCode.trim() || joinLoading} onClick={handleJoin}>
                {joinLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
                Join Squad
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <UpgradeDialog 
        open={showUpgrade} 
        onOpenChange={setShowUpgrade} 
        onPurchaseComplete={handleUpgradeSuccess}
      />
    </>
  );
};

export default CreateGroupDialog;