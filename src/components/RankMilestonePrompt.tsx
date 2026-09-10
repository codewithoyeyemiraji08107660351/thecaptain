import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { playPromotionSound } from "@/lib/sounds";

interface MilestoneConfig {
  rank: string;
  commands: number;
  title: string;
  message: string;
  emoji: string;
}

const MILESTONES: MilestoneConfig[] = [
  { rank: "AB", commands: 2, emoji: "🔱", title: "Able Seaman Unlocked!", message: "You can now see when crew members were last online. Check the Crew list!" },
  { rank: "CPO", commands: 5, emoji: "⚔️", title: "Chief Petty Officer Unlocked!", message: "You can now see fellow crew members' strike counts." },
  { rank: "MIDN", commands: 11, emoji: "🧭", title: "Midshipman Unlocked!", message: "A new secret ability has been unlocked. Explore to discover it!" },
  { rank: "LEUT", commands: 18, emoji: "⭐", title: "Lieutenant Unlocked!", message: "You can now use @crew to ping all squad members (3x/day) in Comms!" },
  { rank: "CAPT", commands: 30, emoji: "🧿", title: "Captain Rank Unlocked!", message: "You can now see how long each Captain has held their title." },
  { rank: "VADM", commands: 42, emoji: "⚜️", title: "Vice Admiral Unlocked!", message: "Foresee unlocked! You can now view other crew members' credit balances. You can also promote/demote fellow crew members." },
  { rank: "ADML", commands: 49, emoji: "👑", title: "Admiral Unlocked!", message: "You have achieved the highest rank! You now have permanent Admin authority and cannot be ejected or demoted." },
];

export { MILESTONES };
export type { MilestoneConfig };

function getMilestoneSeenKey(squadId: string, userId: string, rank: string) {
  return `milestone-seen:${squadId}:${userId}:${rank}`;
}

/** Clear milestone seen keys for ranks the user no longer qualifies for (on demotion). */
export function clearLostMilestoneKeys(squadId: string, userId: string, completedCommands: number) {
  for (const milestone of MILESTONES) {
    if (completedCommands < milestone.commands) {
      try {
        localStorage.removeItem(getMilestoneSeenKey(squadId, userId, milestone.rank));
      } catch {}
    }
  }
}

export function useRankMilestones(
  squadId: string | undefined,
  userId: string | undefined,
  completedCommands: number
) {
  const [pendingMilestone, setPendingMilestone] = useState<MilestoneConfig | null>(null);

  useEffect(() => {
    if (!squadId || !userId || typeof window === "undefined") return;

    // Check milestones from lowest to highest, show the first unseen one the user qualifies for
    for (let i = 0; i < MILESTONES.length; i++) {
      const milestone = MILESTONES[i];
      if (completedCommands >= milestone.commands) {
        const key = getMilestoneSeenKey(squadId, userId, milestone.rank);
        try {
          if (!localStorage.getItem(key)) {
            setPendingMilestone(milestone);
            return;
          }
        } catch {
          // Ignore storage errors
        }
      }
    }
    setPendingMilestone(null);
  }, [squadId, userId, completedCommands]);

  const dismiss = () => {
    if (pendingMilestone && squadId && userId) {
      try {
        localStorage.setItem(
          getMilestoneSeenKey(squadId, userId, pendingMilestone.rank),
          "1"
        );
      } catch {
        // Ignore storage errors
      }
      setPendingMilestone(null);
    }
  };

  return { pendingMilestone, dismiss };
}

const RankMilestonePrompt = ({
  milestone,
  onDismiss,
}: {
  milestone: MilestoneConfig | null;
  onDismiss: () => void;
}) => {
  useEffect(() => {
    if (!milestone) return;
    playPromotionSound();
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [milestone, onDismiss]);

  if (!milestone) return null;

  return (
    <Dialog open={!!milestone} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="bg-card border-primary/30 max-w-xs text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-3 py-4"
        >
          <motion.span
            className="text-5xl invert-protect"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            {milestone.emoji}
          </motion.span>
          <p className="text-lg font-display font-bold text-primary">{milestone.title}</p>
          <p className="text-sm text-muted-foreground">{milestone.message}</p>
          <p className="text-[10px] text-muted-foreground/60 animate-pulse">Auto-dismisses in 5 seconds</p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default RankMilestonePrompt;
