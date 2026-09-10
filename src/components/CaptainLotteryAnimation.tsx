import { useState, useEffect, useRef, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Anchor } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playCaptainLotteryIntroSound, playLotteryTickSound, playCaptainLotteryResultSound } from "@/lib/sounds";

interface CaptainLotteryAnimationProps {
  open: boolean;
  onComplete: (selectedCaptain: User) => void;
  members: User[];
  winner: User; // Pre-determined winner — ensures all clients show the same result
}

const CaptainLotteryAnimation = forwardRef<HTMLDivElement, CaptainLotteryAnimationProps>(({ open, onComplete, members, winner }, ref) => {
  const [phase, setPhase] = useState<"intro" | "spinning" | "slowing" | "result" | "done">("intro");
  const [displayIndex, setDisplayIndex] = useState(0);

  const winnerIdx = members.findIndex(m => m.id === winner.id);
  const safeWinnerIdx = winnerIdx >= 0 ? winnerIdx : 0;
  const onCompleteRef = useRef(onComplete);
  const startedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setPhase("intro");
      setDisplayIndex(0);
      return;
    }

    if (startedRef.current || members.length === 0) return;
    startedRef.current = true;

    playCaptainLotteryIntroSound();
    const introTimeout = setTimeout(() => setPhase("spinning"), 250);

    let count = 0;
    let speed = 50;
    let interval: NodeJS.Timeout | undefined;
    let finishTimeout: NodeJS.Timeout | undefined;
    let completeTimeout: NodeJS.Timeout | undefined;

    const startSpin = () => {
      interval = setInterval(() => {
        count++;
        setDisplayIndex((i) => (i + 1) % members.length);
        playLotteryTickSound();

        if (count > 10) {
          speed = Math.min(speed + 35, 180);
          setPhase("slowing");
          if (interval) clearInterval(interval);
          interval = setInterval(() => {
            count++;
            setDisplayIndex((i) => (i + 1) % members.length);
            playLotteryTickSound();
            if (count > 16) {
              if (interval) clearInterval(interval);
              setDisplayIndex(safeWinnerIdx);
              setPhase("result");
              playCaptainLotteryResultSound();
              finishTimeout = setTimeout(() => setPhase("done"), 300);
              completeTimeout = setTimeout(() => onCompleteRef.current(winner), 500);
            }
          }, speed);
        }
      }, speed);
    };

    const spinTimeout = setTimeout(startSpin, 250);

    return () => {
      clearTimeout(introTimeout);
      clearTimeout(spinTimeout);
      if (interval) clearInterval(interval);
      if (finishTimeout) clearTimeout(finishTimeout);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [open, members.length, winner.id, safeWinnerIdx]);

  if (!open || members.length === 0) return null;

  const displayed = members[displayIndex] || members[0];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-md"
    >
      <div className="flex flex-col items-center">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mb-8"
        >
          <Anchor className="w-8 h-8 text-primary mb-2" />
          <p className="text-lg font-display font-bold text-primary">CAPTAIN LOTTERY</p>
          <p className="text-xs text-muted-foreground mt-1">Selecting The Captain...</p>
        </motion.div>

        {/* Slot frame */}
        <div
          className="relative w-48 h-56 rounded-2xl border-4 overflow-hidden flex items-center justify-center"
          style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--secondary) / 0.3)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={displayIndex}
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{
                duration: phase === "spinning" ? 0.05 : phase === "slowing" ? 0.15 : 0.3,
              }}
              className="flex flex-col items-center"
            >
              <motion.span
                className="text-7xl mb-3 invert-protect"
                animate={phase === "result" || phase === "done" ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.5 }}
              >
                {displayed.avatar}
              </motion.span>
              <p className="text-lg font-display font-bold text-foreground">{displayed.username}</p>
            </motion.div>
          </AnimatePresence>

          {/* Highlight border on result */}
          {(phase === "result" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0.2, 0.4, 0] }}
              transition={{ duration: 1.5 }}
              className="absolute inset-0"
              style={{ background: "hsl(var(--primary) / 0.15)" }}
            />
          )}
        </div>

        {/* Result announcement */}
        <AnimatePresence>
          {(phase === "result" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="mt-6 flex flex-col items-center"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
                transition={{ duration: 0.6 }}
              >
                <Crown className="w-8 h-8 text-primary mb-2" />
              </motion.div>
              <p className="text-sm font-display font-bold text-primary">
                {winner.username} is The Captain!
              </p>
              <p className="text-xs text-muted-foreground mt-1">Let the games begin ⚓</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

CaptainLotteryAnimation.displayName = "CaptainLotteryAnimation";

export default CaptainLotteryAnimation;
