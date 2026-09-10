import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Vote, Skull, Clock } from "lucide-react";
import type { PunishmentPoll as PollType, User, Group } from "@/lib/mockData";
import { getThemePollColors } from "@/lib/squad-themes";

const formatTimeLeft = (ms: number) => {
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes} min ${seconds} sec left`;
};

/** Determine winning option from votes (excludes target user) */
const getWinningOption = (poll: PollType): string | null => {
  const voteCounts: Record<string, number> = {};
  poll.options.forEach((_, i) => { voteCounts[String(i)] = 0; });
  Object.entries(poll.votes).forEach(([voterId, vote]) => {
    if (voterId === poll.targetUserId) return;
    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
  });
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] === 0) return null;
  return sorted[0][0];
};

interface PunishmentPollProps {
  poll: PollType;
  group: Group;
  currentUser: User;
  onVote: (pollId: string, optionIndex: string) => void;
  onCompletePunishment: (pollId: string) => void;
  onFailPunishment?: (pollId: string) => void;
  onTransitionToPunishment?: (pollId: string) => void;
  personalTheme?: string;
}

const PunishmentPollView = ({ poll, group, currentUser, onVote, onCompletePunishment, onFailPunishment, onTransitionToPunishment, personalTheme = "default" }: PunishmentPollProps) => {
  const pollColors = getThemePollColors(personalTheme);
  const target = group.members.find(m => m.id === poll.targetUserId);
  const currentMember = group.members.find(m => m.id === currentUser.id);
  const isAdmin = currentUser.id === group.adminId || (currentMember?.completedCommands ?? currentUser.completedCommands) >= 49;
  const isPunishedUser = currentUser.id === poll.targetUserId;
  const currentVote = !isPunishedUser ? poll.votes[currentUser.id] : undefined;
  const [now, setNow] = useState(Date.now());

  // Determine phase: voting or punishment
  const votingExpired = poll.expiresAt.getTime() <= now;
  const inPunishmentPhase = votingExpired && !!poll.punishmentDeadline && !poll.punishmentCompleted;
  const punishmentExpired = inPunishmentPhase && poll.punishmentDeadline!.getTime() <= now;

  useEffect(() => {
    // Determine the relevant deadline to track
    const deadline = inPunishmentPhase && poll.punishmentDeadline
      ? poll.punishmentDeadline.getTime()
      : poll.expiresAt.getTime();
    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0 && inPunishmentPhase) return; // Already expired in punishment phase
    if (timeLeft <= 0 && !poll.punishmentDeadline && votingExpired) {
      // Voting just expired, no punishment deadline yet - trigger transition
      onTransitionToPunishment?.(poll.id);
      return;
    }
    const interval = timeLeft < 3600000 ? 1000 : 30000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [poll.expiresAt, poll.punishmentDeadline, inPunishmentPhase, votingExpired]);

  // Trigger transition when voting expires
  useEffect(() => {
    if (votingExpired && !poll.punishmentDeadline && !poll.punishmentCompleted) {
      onTransitionToPunishment?.(poll.id);
    }
  }, [votingExpired, poll.punishmentDeadline, poll.punishmentCompleted, poll.id]);

  const voteCounts: Record<string, number> = {};
  poll.options.forEach((_, i) => { voteCounts[String(i)] = 0; });
  Object.entries(poll.votes).forEach(([voterId, vote]) => {
    if (voterId === poll.targetUserId) return;
    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
  });
  const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);

  const canVote = !isPunishedUser && !votingExpired;

  // Get winning option text
  const winningIdx = poll.winningOption ?? getWinningOption(poll);
  const winningOptionText = winningIdx !== null && winningIdx !== undefined
    ? poll.options[Number(winningIdx)] || null
    : null;

  // Punishment phase timer
  const punishmentTimeLeft = inPunishmentPhase && poll.punishmentDeadline
    ? Math.max(0, poll.punishmentDeadline.getTime() - now)
    : 0;
  const punishmentTimeStr = formatTimeLeft(punishmentTimeLeft);

  // Voting phase timer  
  const votingTimeLeft = Math.max(0, poll.expiresAt.getTime() - now);
  const votingTimeStr = formatTimeLeft(votingTimeLeft);

  // ---- PUNISHMENT PHASE UI ----
  if (inPunishmentPhase) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl p-2.5 mb-2 border ${pollColors ? "" : "border-destructive/30 bg-destructive/5"}`}
        style={pollColors ? { borderColor: pollColors.border, background: pollColors.bg } : undefined}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Skull className={`w-3.5 h-3.5 ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined} />
          <h3 className={`font-display font-bold text-xs ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>PUNISHMENT ACTIVE</h3>
        </div>

        <p className="text-[11px] text-muted-foreground mb-1">
          {target?.avatar} <span className="font-semibold text-foreground">{target?.username}</span> must complete:
        </p>

        {winningOptionText && (
          <div className={`rounded-lg p-2 mb-1.5 border ${pollColors ? "" : "bg-destructive/10 border-destructive/20"}`} style={pollColors ? { background: pollColors.barBg, borderColor: pollColors.border } : undefined}>
            <p className={`text-xs font-bold text-center ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>{winningOptionText}</p>
          </div>
        )}

        {/* Timer */}
        {!punishmentExpired && punishmentTimeStr && (
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <Clock className={`w-3 h-3 animate-pulse ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined} />
            <span className={`text-[11px] font-bold ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>{punishmentTimeStr}</span>
          </div>
        )}

        {punishmentExpired && (
          <p className={`text-[10px] font-bold text-center mb-1.5 ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>⏰ TIME'S UP!</p>
        )}

        {/* Admin actions */}
        {isAdmin && !poll.punishmentCompleted && (
          <div className="flex gap-1.5">
            <Button variant="hero" size="sm" className="h-6 text-[10px] flex-1" onClick={() => onCompletePunishment(poll.id)}>
              ✅ Punishment Successful
            </Button>
            {onFailPunishment && (
              <Button variant="destructive" size="sm" className="h-6 text-[10px] flex-1" onClick={() => onFailPunishment(poll.id)}>
                ❌ Punishment Failed
              </Button>
            )}
          </div>
        )}

        {!isAdmin && !punishmentExpired && (
          <p className="text-[10px] text-muted-foreground text-center">Waiting for admin to confirm result...</p>
        )}
      </motion.div>
    );
  }

  // ---- VOTING PHASE UI ----
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-2.5 mb-2 border ${pollColors ? "" : "border-destructive/30 bg-destructive/5"}`}
      style={pollColors ? { borderColor: pollColors.border, background: pollColors.bg } : undefined}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Skull className={`w-3.5 h-3.5 ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined} />
        <h3 className={`font-display font-bold text-xs ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>PUNISHMENT POLL</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-1.5">
        {target?.avatar} <span className="font-semibold text-foreground">{target?.username}</span> received 3 strikes!
        {votingTimeStr && <span className="ml-1">({votingTimeStr})</span>}
        {votingExpired && <span className="ml-1">(Voting closed)</span>}
      </p>

      {isPunishedUser && !votingExpired && (
        <p className={`text-[10px] font-semibold mb-1.5 ${pollColors ? "" : "text-destructive"}`} style={pollColors ? { color: pollColors.text } : undefined}>You cannot vote on your own punishment poll.</p>
      )}

      <div className="space-y-1 mb-1.5">
        {poll.options.map((option, i) => {
          const count = voteCounts[String(i)] || 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const isMyVote = currentVote === String(i);
          return (
            <button
              key={i}
              onClick={() => canVote && onVote(poll.id, String(i))}
              disabled={!canVote}
              className={`w-full text-left p-1.5 rounded-lg border transition-all relative overflow-hidden text-xs ${
                isMyVote ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-muted-foreground"
              } ${!canVote ? "cursor-default opacity-80" : "cursor-pointer"}`}
            >
              {(currentVote !== undefined || votingExpired || isPunishedUser) && (
                <div className="absolute inset-y-0 left-0 bg-primary/10 transition-all" style={{ width: `${pct}%` }} />
              )}
              <div className="relative flex justify-between items-center">
                <span className="text-[11px] font-medium">{option}</span>
                {(currentVote !== undefined || votingExpired || isPunishedUser) && <span className="text-[10px] text-muted-foreground">{count}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {currentVote !== undefined && !votingExpired && !isPunishedUser && (
        <p className="text-[10px] text-muted-foreground mb-1">Tap another option to change your vote</p>
      )}
    </motion.div>
  );
};

// Admin creates poll — now includes poll duration slider
interface CreatePollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: User | null;
  onCreatePoll: (options: string[], pollDurationHours: number) => void;
}

export const CreatePollDialog = ({ open, onOpenChange, targetUser, onCreatePoll }: CreatePollDialogProps) => {
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [pollDurationHours, setPollDurationHours] = useState(6);

  const addOption = () => {
    if (options.length < 5) setOptions([...options, ""]);
  };

  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const handleCreate = () => {
    const valid = options.filter(o => o.trim());
    if (valid.length < 2) return;
    onCreatePoll(valid, pollDurationHours);
    setOptions(["", ""]);
    setPollDurationHours(6);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Skull className="w-5 h-5 text-destructive" />
            Create Punishment Poll
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {targetUser?.avatar} <span className="font-semibold">{targetUser?.username}</span> received 3 strikes. Choose punishments:
        </p>
        <div className="space-y-2 mt-3">
          {options.map((opt, i) => (
            <Input
              key={i}
              value={opt}
              onChange={e => updateOption(i, e.target.value)}
              placeholder={`Punishment option ${i + 1}`}
              className="bg-secondary/50 border-border"
            />
          ))}
          {options.length < 5 && (
            <Button variant="ghost" size="sm" onClick={addOption}>
              <Plus className="w-4 h-4 mr-1" /> Add Option
            </Button>
          )}
        </div>

        {/* Poll Duration Slider */}
        <div className="p-3 rounded-xl bg-secondary/50 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold">Poll Duration</Label>
            <span className="text-sm font-bold text-primary ml-auto">{pollDurationHours}h</span>
          </div>
          <Slider
            value={[pollDurationHours]}
            onValueChange={([v]) => setPollDurationHours(v)}
            min={1} max={24} step={1}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground mt-1">How long members can vote</p>
        </div>

        <Button variant="serve" className="w-full mt-3" onClick={handleCreate} disabled={options.filter(o => o.trim()).length < 2}>
          <Vote className="w-4 h-4 mr-2" />
          Publish Poll
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default PunishmentPollView;
