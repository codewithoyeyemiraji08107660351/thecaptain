import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import RankBadge from "@/components/RankBadge";
import { getRank, getNextRank, getRankProgress, getCommandsToNextRank, RANKS, isViceAdmiral, isChiefPettyOfficer } from "@/lib/ranks";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Gift } from "lucide-react";
import type { User } from "@/lib/mockData";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  enlistDate?: Date;
  onFlexRank?: (user: User) => void;
  /** The viewer's completed commands (squad-scoped) to determine foresee access */
  viewerCompletedCommands?: number;
  /** Whether the viewer is looking at their own profile */
  isViewingSelf?: boolean;
  /** Callback when gift button is tapped */
  onGift?: (user: User) => void;
}

const RankListDialog = ({ open, onOpenChange, completedCommands }: { open: boolean; onOpenChange: (o: boolean) => void; completedCommands: number }) => {
  const rank = getRank(completedCommands);
  const nextRank = getNextRank(completedCommands);
  const progress = getRankProgress(completedCommands);
  const remaining = getCommandsToNextRank(completedCommands);
  const currentRankRef = useRef<HTMLDivElement>(null);

  // Sort descending so highest rank at top, current rank near bottom
  const sortedRanks = [...RANKS].sort((a, b) => b.commandsRequired - a.commandsRequired);

  useEffect(() => {
    if (open) {
      const timers = [100, 300, 500].map(delay =>
        setTimeout(() => {
          currentRankRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, delay)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Navy Ranks</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1 pr-3">
            {sortedRanks.map((r) => {
              const isCurrent = r.abbreviation === rank.abbreviation;
              const isAchieved = completedCommands >= r.commandsRequired;
              return (
                <div
                  key={r.abbreviation}
                  ref={isCurrent ? currentRankRef : undefined}
                  className={`flex items-center gap-3 p-2.5 rounded-lg text-sm transition-all ${
                    isCurrent ? "bg-primary/10 border border-primary/30" : isAchieved ? "bg-secondary/50" : "opacity-40"
                  }`}
                >
                  <span className="text-lg w-7 text-center invert-protect">{r.badge}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${isCurrent ? "text-primary" : ""}`}>
                      {r.title}
                      <span className="text-muted-foreground font-normal ml-1">({r.abbreviation})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.commandsRequired === 0 ? "Starting rank" : `${r.commandsRequired} command${r.commandsRequired > 1 ? "s" : ""} completed`}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold shrink-0">YOU</span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {/* Progress bar to next rank */}
        {nextRank && (
          <div className="mt-3 px-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{rank.badge} {rank.abbreviation}</span>
              <span>{nextRank.badge} {nextRank.abbreviation}</span>
            </div>
            <Progress value={progress} className="h-2.5" />
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              {remaining} more command{remaining > 1 ? "s" : ""} to {nextRank.title}
            </p>
          </div>
        )}
        {!nextRank && (
          <p className="text-xs text-primary font-semibold text-center mt-2">👑 Maximum rank achieved!</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

const UserProfileDialog = ({ open, onOpenChange, user, enlistDate, onFlexRank, viewerCompletedCommands, isViewingSelf, onGift }: UserProfileDialogProps) => {
  const [showRanks, setShowRanks] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flexing, setFlexing] = useState(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setFlexing(false);
  }, []);

  const startLongPress = useCallback(() => {
    if (!user || !onFlexRank) return;
    setFlexing(true);
    longPressTimerRef.current = setTimeout(() => {
      onFlexRank(user);
      onOpenChange(false);
      setFlexing(false);
    }, 2000);
  }, [user, onFlexRank, onOpenChange]);

  // Cleanup on unmount or dialog close
  useEffect(() => {
    if (!open) clearLongPress();
    return clearLongPress;
  }, [open, clearLongPress]);

  if (!user) return null;
  const rank = getRank(user.completedCommands);
  const nextRank = getNextRank(user.completedCommands);
  const progress = getRankProgress(user.completedCommands);
  const remaining = getCommandsToNextRank(user.completedCommands);

  // Foresee: VADM+ can see other users' credit balances
  const canForesee = !isViewingSelf && typeof viewerCompletedCommands === "number" && isViceAdmiral(viewerCompletedCommands);
  // CPO+ can see strikes
  const canSeeStrikes = typeof viewerCompletedCommands === "number" && isChiefPettyOfficer(viewerCompletedCommands);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <span
              className={`text-6xl invert-protect select-none transition-transform duration-200 ${flexing ? "scale-125 animate-pulse" : ""} ${onFlexRank ? "cursor-pointer" : ""}`}
              onMouseDown={startLongPress}
              onMouseUp={clearLongPress}
              onMouseLeave={clearLongPress}
              onTouchStart={startLongPress}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
              onContextMenu={(e) => e.preventDefault()}
            >
              {user.avatar}
            </span>
            <p className="text-lg font-bold font-display">{user.username}</p>
            <div className="flex items-center gap-2">
              <RankBadge completedCommands={user.completedCommands} strikes={user.strikes} size="md" showStrikes={false} />
              <button
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setShowRanks(true)}
              >
                {rank.title} ({rank.abbreviation})
              </button>
            </div>
            {/* Progress bar */}
            {nextRank ? (
              <div className="w-full px-4">
                <Progress value={progress} className="h-2" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {remaining} more command{remaining > 1 ? "s" : ""} to {nextRank.badge} {nextRank.abbreviation}
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-primary font-semibold">👑 Maximum rank achieved!</p>
            )}
            <p className="text-[10px] text-muted-foreground">Tap rank to view all ranks</p>
            {canSeeStrikes && user.strikes > 0 && (
              <p className="text-sm text-destructive font-semibold">
                {"❌".repeat(Math.min(user.strikes, 3))} {user.strikes} strike{user.strikes !== 1 ? "s" : ""}
              </p>
            )}
            {/* Foresee - VADM+ can see other users' credit balances */}
            {canForesee && (
              <div className="w-full px-4 mt-1 p-3 rounded-xl bg-secondary/50 border border-accent/20">
                <div className="flex items-center gap-1.5 justify-center mb-2">
                  <Eye className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-display font-bold text-accent">Foresee</span>
                </div>
                <div className="flex gap-4 justify-center">
                  <div className="text-center">
                    <p className="text-sm font-bold text-accent">{user.actionCredits}</p>
                    <p className="text-[9px] text-muted-foreground">Actions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold" style={{ color: "hsl(270 80% 60%)" }}>{user.superActionCredits}</p>
                    <p className="text-[9px] text-muted-foreground">Super</p>
                  </div>
                </div>
              </div>
            )}
            {enlistDate && (
              <p className="text-xs text-muted-foreground">
                Enlisted: {enlistDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}
            {/* Gift Credits Button */}
            {!isViewingSelf && onGift && user && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => { onGift(user); onOpenChange(false); }}
              >
                <Gift className="w-4 h-4" />
                Gift Credits
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <RankListDialog open={showRanks} onOpenChange={setShowRanks} completedCommands={user.completedCommands} />
    </>
  );
};

export default UserProfileDialog;
