import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users } from "lucide-react";
import RankBadge from "@/components/RankBadge";
import UserProfileDialog from "@/components/UserProfileDialog";
import { getRank, isAdmiral, isAbleSeaman, isChiefPettyOfficer } from "@/lib/ranks";
import { formatLastSeen } from "@/hooks/use-last-online";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@/lib/mockData";

interface CrewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: User[];
  isAdmin?: boolean;
  adminId?: string;
  currentUserId?: string;
  currentUserCommands?: number;
  onTransferAdmin?: (userId: string) => void;
  onGiftUser?: (user: User) => void;
}

const CrewDialog = ({ open, onOpenChange, members, isAdmin, adminId, currentUserId, currentUserCommands = 0, onTransferAdmin, onGiftUser }: CrewDialogProps) => {
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const profileUser = profileUserId ? members.find(m => m.id === profileUserId) ?? null : null;
  const [transferTarget, setTransferTarget] = useState<User | null>(null);
  const [showTransferList, setShowTransferList] = useState(false);
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string | null>>({});

  const currentAdmin = members.find(m => m.id === currentUserId);
  const isCurrentUserAdmin = currentUserId === adminId;
  const isNonAdmiralAdmin = isCurrentUserAdmin && currentAdmin && !isAdmiral(currentAdmin.completedCommands);

  const transferEligible = members.filter(m => 
    m.id !== currentUserId && 
    m.id !== adminId && 
    !isAdmiral(m.completedCommands)
  );

  const canSeeLastOnline = isAbleSeaman(currentUserCommands);
  const canSeeStrikes = isChiefPettyOfficer(currentUserCommands);

  // Build last seen map from member data (updated via realtime) + fallback fetch
  useEffect(() => {
    if (!open || !canSeeLastOnline) return;
    // Immediately populate from member.lastSeenAt (realtime-updated)
    const fromMembers: Record<string, string | null> = {};
    members.forEach(m => { fromMembers[m.id] = m.lastSeenAt ?? null; });
    setLastSeenMap(fromMembers);

    // Also fetch fresh from DB to fill any gaps
    const fetchLastSeen = async () => {
      const ids = members.map(m => m.id);
      const { data } = await supabase.from("profiles").select("id, last_seen_at").in("id", ids);
      if (data) {
        const map: Record<string, string | null> = {};
        data.forEach(p => { map[p.id] = p.last_seen_at; });
        setLastSeenMap(map);
      }
    };
    fetchLastSeen();
    const interval = setInterval(fetchLastSeen, 15000);
    return () => clearInterval(interval);
  }, [open, canSeeLastOnline, members]);

  const sorted = [...members].sort((a, b) => b.completedCommands - a.completedCommands);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Crew ({members.length}/50)
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[480px]" style={{ scrollbarWidth: "none" }}>
            <div className="space-y-1.5 pr-2">
              {sorted.map(member => {
                const rank = getRank(member.completedCommands);
                const isMemberAdmin = member.id === adminId;
                const lastSeen = lastSeenMap[member.id];
                return (
                  <button
                    key={member.id}
                    onClick={() => setProfileUserId(member.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-left"
                  >
                    <span className="text-xl invert-protect">{member.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-xs truncate">{member.username}</span>
                        {isMemberAdmin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                            Admin
                          </span>
                        )}
                      </div>
                      {canSeeLastOnline && (
                        <p className={`text-[9px] ${formatLastSeen(lastSeen) === "ONLINE" ? "text-success font-semibold" : "text-muted-foreground"}`}>
                          {formatLastSeen(lastSeen)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {canSeeStrikes && member.strikes > 0 && (
                        <span className="text-xs">{"❌".repeat(Math.min(member.strikes, 3))}</span>
                      )}
                      {member.warnings > 0 && (
                        <span className="text-xs">{"⚠️".repeat(Math.min(member.warnings, 3))}</span>
                      )}
                      <RankBadge completedCommands={member.completedCommands} strikes={member.strikes} showStrikes={false} size="sm" />
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <UserProfileDialog
        open={!!profileUser}
        onOpenChange={(o) => !o && setProfileUserId(null)}
        user={profileUser}
        viewerCompletedCommands={currentUserCommands}
        isViewingSelf={profileUser?.id === currentUserId}
        onGift={onGiftUser}
      />

      {/* Admin Transfer - Select user list */}
      <Dialog open={showTransferList} onOpenChange={setShowTransferList}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-display">👑 Transfer Admin Authority</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Select a crew member to transfer admin authority to:</p>
          <ScrollArea className="max-h-[400px]" style={{ scrollbarWidth: "none" }}>
            <div className="space-y-1.5 pr-2">
              {transferEligible.map(member => {
                const rank = getRank(member.completedCommands);
                return (
                  <button
                    key={member.id}
                    onClick={() => {
                      setTransferTarget(member);
                      setShowTransferList(false);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-left"
                  >
                    <span className="text-xl invert-protect">{member.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-xs truncate">{member.username}</span>
                      <p className="text-[10px] text-muted-foreground">{rank.title}</p>
                    </div>
                    <RankBadge completedCommands={member.completedCommands} strikes={member.strikes} showStrikes={false} size="sm" />
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Admin transfer confirmation */}
      <AlertDialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to transfer Admin Authority?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to transfer admin authority to <strong>{transferTarget?.username}</strong>. You will become a normal crew member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTransferTarget(null)}>Nay</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (transferTarget && onTransferAdmin) {
                  onTransferAdmin(transferTarget.id);
                  setTransferTarget(null);
                  setShowTransferList(false);
                }
              }}
            >
              Yar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CrewDialog;
