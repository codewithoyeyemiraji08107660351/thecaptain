import { useState, useEffect, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Anchor, Skull } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playResetFlashSound, playResetScatterSound, playResetRebuildSound } from "@/lib/sounds";

interface SquadResetAnimationProps {
  open: boolean;
  members: User[];
  onComplete: () => void;
}

const SquadResetAnimation = forwardRef<HTMLDivElement, SquadResetAnimationProps>(
  ({ open, members, onComplete }, ref) => {
    const [phase, setPhase] = useState<"flash" | "scatter" | "wipe" | "rebuild" | "done">("flash");

    useEffect(() => {
      if (!open) {
        setPhase("flash");
        return;
      }
      setPhase("flash");
      playResetFlashSound();
      const t1 = setTimeout(() => { setPhase("scatter"); playResetScatterSound(); }, 800);
      const t2 = setTimeout(() => setPhase("wipe"), 2200);
      const t3 = setTimeout(() => { setPhase("rebuild"); playResetRebuildSound(); }, 3400);
      const t4 = setTimeout(() => setPhase("done"), 4800);
      const t5 = setTimeout(onComplete, 5300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
      };
    }, [open]);

    if (!open) return null;

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-md overflow-hidden"
      >
        <div className="flex flex-col items-center relative">
          {/* Phase 1: Red flash + RESET title */}
          {phase === "flash" && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.4, 0] }}
                transition={{ duration: 0.6 }}
                className="absolute bg-destructive/30 rounded-full blur-3xl w-64 h-64"
                style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
              />
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.5, 1], rotate: 0 }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
                className="mb-4"
              >
                <RotateCcw className="w-16 h-16 text-destructive" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-display font-bold tracking-[0.4em] text-destructive uppercase"
              >
                RESET
              </motion.p>
            </>
          )}

          {/* Phase 2: Member avatars scatter and fall */}
          {phase === "scatter" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center"
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-muted-foreground uppercase tracking-[0.3em] mb-6"
              >
                Clearing all ranks...
              </motion.p>
              <div className="relative w-64 h-48 flex items-center justify-center">
                {members.slice(0, 12).map((member, i) => {
                  const angle = (i / Math.min(members.length, 12)) * Math.PI * 2;
                  const radius = 70;
                  const startX = Math.cos(angle) * radius;
                  const startY = Math.sin(angle) * radius;
                  const fallX = startX + (Math.random() - 0.5) * 120;
                  return (
                    <motion.div
                      key={member.id}
                      initial={{ x: startX, y: startY, opacity: 1, scale: 1 }}
                      animate={{
                        x: fallX,
                        y: 200,
                        opacity: 0,
                        scale: 0.3,
                        rotate: (Math.random() - 0.5) * 360,
                      }}
                      transition={{ duration: 1, delay: i * 0.08, ease: "easeIn" }}
                      className="absolute text-2xl invert-protect"
                    >
                      {member.avatar}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Phase 3: Wipe line across screen */}
          {phase === "wipe" && (
            <motion.div className="flex flex-col items-center">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: [0, 1, 1, 0] }}
                transition={{ duration: 1, times: [0, 0.4, 0.6, 1] }}
                className="w-64 h-0.5 bg-destructive origin-left mb-8"
              />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1, times: [0, 0.3, 0.7, 1] }}
                className="flex items-center gap-3"
              >
                <Skull className="w-5 h-5 text-destructive" />
                <p className="text-sm font-display font-bold text-destructive">
                  Strikes cleared • Warnings cleared • Ranks reset
                </p>
                <Skull className="w-5 h-5 text-destructive" />
              </motion.div>
            </motion.div>
          )}

          {/* Phase 4: Members reappear as Plebs */}
          {(phase === "rebuild" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ type: "spring", bounce: 0.5 }}
                className="mb-4"
              >
                <Anchor className="w-10 h-10 text-primary" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-display font-bold text-primary mb-4"
              >
                ALL HANDS ON DECK
              </motion.p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {members.slice(0, 12).map((member, i) => (
                  <motion.div
                    key={member.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.06, type: "spring", bounce: 0.4 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-2xl invert-protect">{member.avatar}</span>
                    <span className="text-[8px] text-muted-foreground invert-protect">🪨 Pleb</span>
                  </motion.div>
                ))}
              </div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-xs text-muted-foreground mt-4"
              >
                Selecting a new Captain...
              </motion.p>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }
);

SquadResetAnimation.displayName = "SquadResetAnimation";

export default SquadResetAnimation;
