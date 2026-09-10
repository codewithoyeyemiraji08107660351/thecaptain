import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Swords, Bomb, Shuffle } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playCoupSlashSound, playCoupRevealSound, playLotteryTickSound, playLotteryResultSound, playSaboteurShakeSound, playSaboteurAlarmSound } from "@/lib/sounds";

// ── Coup D'état Animation ──
export const CoupAnimation = ({ 
  open, onComplete, oldCaptain, newCaptain 
}: { 
  open: boolean; onComplete: () => void; oldCaptain: User; newCaptain: User;
}) => {
  const [phase, setPhase] = useState<"enter" | "slash" | "swap" | "done">("enter");

  useEffect(() => {
    if (!open) { setPhase("enter"); return; }
    const t1 = setTimeout(() => { setPhase("slash"); playCoupSlashSound(); }, 600);
    const t2 = setTimeout(() => { setPhase("swap"); playCoupRevealSound(); }, 1400);
    const t3 = setTimeout(() => setPhase("done"), 2600);
    const t4 = setTimeout(onComplete, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [open]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
    >
      <div className="relative w-72 h-80 flex flex-col items-center justify-center">
        {/* Slash effect */}
        <AnimatePresence>
          {phase === "slash" && (
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 3, rotate: 0, opacity: [1, 1, 0] }}
              transition={{ duration: 0.8 }}
              className="absolute"
            >
              <Swords className="w-20 h-20" style={{ color: "hsl(270 80% 60%)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Old captain sliding out */}
        <motion.div
          animate={
            phase === "enter" ? { x: 0, opacity: 1 } :
            phase === "slash" ? { x: 0, opacity: 1, scale: [1, 1.1, 1] } :
            { x: -300, opacity: 0, rotate: -15 }
          }
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="flex flex-col items-center mb-4"
        >
          <span className="text-6xl mb-2 invert-protect">{oldCaptain.avatar}</span>
          <p className="text-sm font-display font-bold text-muted-foreground">{oldCaptain.username}</p>
          <div className="flex items-center gap-1 mt-1">
            <Crown className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Former Captain</span>
          </div>
        </motion.div>

        {/* New captain sliding in */}
        <AnimatePresence>
          {(phase === "swap" || phase === "done") && (
            <motion.div
              initial={{ x: 300, opacity: 0, scale: 0.5 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
              className="absolute flex flex-col items-center"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <span className="text-7xl mb-2 block invert-protect">{newCaptain.avatar}</span>
              </motion.div>
              <p className="text-lg font-display font-bold" style={{ color: "hsl(270 80% 60%)" }}>{newCaptain.username}</p>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
                className="flex items-center gap-1 mt-1"
              >
                <Crown className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-primary">NEW CAPTAIN</span>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-xs mt-3 font-display font-bold tracking-wider"
                style={{ color: "hsl(270 80% 60%)" }}
              >
                <span className="invert-protect">⚔️</span> COUP D'ÉTAT <span className="invert-protect">⚔️</span>
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ── Rank Lottery Animation (Slot Machine) ──
export const RankLotteryAnimation = ({
  open, onComplete, members, currentUser, target
}: {
  open: boolean; onComplete: () => void; members: User[]; currentUser: User; target: User;
}) => {
  const [phase, setPhase] = useState<"spinning" | "slowing" | "result" | "done">("spinning");
  const [displayIndex, setDisplayIndex] = useState(0);

  useEffect(() => {
    if (!open) { setPhase("spinning"); setDisplayIndex(0); return; }
    
    // Fast spin phase
    let interval: NodeJS.Timeout;
    let speed = 80;
    let count = 0;
    const targetIndex = members.findIndex(m => m.id === target.id);
    
    const spin = () => {
      count++;
      setDisplayIndex(i => (i + 1) % members.length);
      playLotteryTickSound();
      
      if (count > 20) {
        // Slowing phase
        speed = Math.min(speed + 30, 400);
        setPhase("slowing");
      }
      
      if (count > 30) {
        clearInterval(interval);
        setDisplayIndex(targetIndex >= 0 ? targetIndex : 0);
        setPhase("result");
        playLotteryResultSound();
        setTimeout(() => setPhase("done"), 1500);
        setTimeout(onComplete, 2200);
        return;
      }
      
      clearInterval(interval);
      interval = setInterval(spin, speed);
    };
    
    interval = setInterval(spin, speed);
    return () => clearInterval(interval);
  }, [open, members, target]);

  if (!open) return null;

  const displayedMember = members[displayIndex] || members[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
    >
      <div className="flex flex-col items-center">
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-display font-bold tracking-wider mb-6"
          style={{ color: "hsl(270 80% 60%)" }}
        >
          <span className="invert-protect">🎰</span> RANK LOTTERY <span className="invert-protect">🎰</span>
        </motion.p>

        {/* Slot machine frame */}
        <div className="relative w-52 h-64 rounded-2xl border-4 overflow-hidden"
          style={{ borderColor: "hsl(270 80% 60%)", background: "hsl(220 18% 8%)" }}
        >
          {/* Spinning reel */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              key={displayIndex}
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: phase === "spinning" ? 0.05 : phase === "slowing" ? 0.15 : 0.3 }}
              className="flex flex-col items-center"
            >
              <motion.span
                className="text-7xl mb-3 invert-protect"
                animate={phase === "result" || phase === "done" ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 0.4 }}
              >
                {displayedMember.avatar}
              </motion.span>
              <p className="text-lg font-display font-bold">{displayedMember.username}</p>
            </motion.div>
          </div>

          {/* Highlight lines */}
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-24 border-y-2 pointer-events-none"
            style={{ borderColor: "hsl(270 80% 60% / 0.4)" }}
          />

          {/* Glow overlay on result */}
          {(phase === "result" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0.1, 0.3, 0] }}
              transition={{ duration: 1.5 }}
              className="absolute inset-0"
              style={{ background: "hsl(270 80% 60% / 0.15)" }}
            />
          )}
        </div>

        {/* Result text */}
        <AnimatePresence>
          {(phase === "result" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 text-center"
            >
              <p className="text-sm font-bold" style={{ color: "hsl(270 80% 60%)" }}>
                Swapping with <span className="invert-protect">{target.avatar}</span> {target.username}!
              </p>
              <div className="flex items-center gap-3 mt-3 justify-center">
                <div className="text-center">
                  <span className="text-2xl invert-protect">{currentUser.avatar}</span>
                  <p className="text-[10px] text-muted-foreground mt-1">{currentUser.username}</p>
                </div>
                <motion.div
                  animate={{ rotate: [0, 180, 360] }}
                  transition={{ duration: 0.8, repeat: 1 }}
                >
                  <Shuffle className="w-6 h-6" style={{ color: "hsl(270 80% 60%)" }} />
                </motion.div>
                <div className="text-center">
                  <span className="text-2xl invert-protect">{target.avatar}</span>
                  <p className="text-[10px] text-muted-foreground mt-1">{target.username}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ── Saboteur Animation ──
export const SaboteurAnimation = ({
  open, onComplete, targetUser
}: {
  open: boolean; onComplete: () => void; targetUser: User;
}) => {
  const [phase, setPhase] = useState<"enter" | "shake" | "change" | "done">("enter");

  useEffect(() => {
    if (!open) { setPhase("enter"); return; }
    const t1 = setTimeout(() => { setPhase("shake"); playSaboteurShakeSound(); }, 500);
    const t2 = setTimeout(() => { setPhase("change"); playSaboteurAlarmSound(); }, 1800);
    const t3 = setTimeout(() => setPhase("done"), 2800);
    const t4 = setTimeout(onComplete, 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [open]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
    >
      <div className="flex flex-col items-center">
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-display font-bold tracking-wider mb-6"
          style={{ color: "hsl(270 80% 60%)" }}
        >
          <span className="invert-protect">💣</span> SABOTEUR <span className="invert-protect">💣</span>
        </motion.p>

        <div className="flex flex-col items-center mb-6">
          <span className="text-5xl mb-2 invert-protect">{targetUser.avatar}</span>
          <p className="text-sm font-display font-bold">{targetUser.username}</p>
        </div>

        {/* Timer display */}
        <motion.div
          animate={
            phase === "shake" ? {
              x: [0, -8, 8, -12, 12, -8, 8, -4, 4, 0],
              rotate: [0, -3, 3, -5, 5, -3, 3, -1, 1, 0],
            } : phase === "change" || phase === "done" ? {
              scale: [1, 1.3, 1],
            } : {}
          }
          transition={
            phase === "shake" ? { duration: 1.2, repeat: 1 } :
            { duration: 0.5 }
          }
          className="w-40 h-40 rounded-2xl border-4 flex flex-col items-center justify-center"
          style={{
            borderColor: phase === "change" || phase === "done"
              ? "hsl(0 72% 51%)"
              : "hsl(270 80% 60%)",
            background: phase === "change" || phase === "done"
              ? "hsl(0 72% 51% / 0.1)"
              : "hsl(270 80% 60% / 0.1)",
          }}
        >
          <AnimatePresence mode="wait">
            {(phase === "enter" || phase === "shake") ? (
              <motion.div key="old" className="flex flex-col items-center" exit={{ scale: 0, opacity: 0 }}>
                <span className="text-3xl font-display font-bold text-foreground">24:00</span>
                <span className="text-xs text-muted-foreground mt-1">hours remaining</span>
              </motion.div>
            ) : (
              <motion.div
                key="new"
                initial={{ scale: 3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
                className="flex flex-col items-center"
              >
                <span className="text-3xl font-display font-bold text-destructive">2:00</span>
                <span className="text-xs text-destructive mt-1">minutes remaining</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {(phase === "change" || phase === "done") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <Bomb className="w-6 h-6 mx-auto mb-1" style={{ color: "hsl(270 80% 60%)" }} />
            <p className="text-xs font-bold text-destructive text-center">TIME SABOTAGED!</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
