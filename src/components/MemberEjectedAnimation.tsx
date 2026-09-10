import { useState, useEffect, useRef, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ban, Skull, AlertTriangle } from "lucide-react";
import { playEjectedSound } from "@/lib/sounds";

interface MemberEjectedAnimationProps {
  open: boolean;
  username: string;
  avatar: string;
  onComplete: () => void;
}

const MemberEjectedAnimation = forwardRef<HTMLDivElement, MemberEjectedAnimationProps>(
  ({ open, username, avatar, onComplete }, ref) => {
    const [phase, setPhase] = useState<"flash" | "eject" | "message" | "done">("flash");
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
      onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
      if (!open) {
        setPhase("flash");
        return;
      }
      setPhase("flash");
      playEjectedSound();
      const t1 = setTimeout(() => setPhase("eject"), 800);
      const t2 = setTimeout(() => setPhase("message"), 2200);
      const t3 = setTimeout(() => setPhase("done"), 3400);
      const t4 = setTimeout(() => onCompleteRef.current(), 3600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
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
          {/* Phase 1: Red flash + warning */}
          {phase === "flash" && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0.2, 0.5, 0] }}
                transition={{ duration: 0.7 }}
                className="absolute bg-destructive/40 rounded-full blur-3xl w-80 h-80"
                style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
              />
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.5, 1], rotate: 0 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.5 }}
                className="mb-4"
              >
                <AlertTriangle className="w-16 h-16 text-destructive" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-display font-bold tracking-[0.3em] text-destructive uppercase"
              >
                EJECTED
              </motion.p>
            </>
          )}

          {/* Phase 2: Avatar gets yeeted */}
          {phase === "eject" && (
            <motion.div className="flex flex-col items-center relative">
              <motion.div
                initial={{ x: 0, y: 0, rotate: 0, scale: 1 }}
                animate={{ 
                  x: [0, -20, 300],
                  y: [0, -50, 200],
                  rotate: [0, -30, 720],
                  scale: [1, 1.2, 0.3],
                  opacity: [1, 1, 0]
                }}
                transition={{ duration: 1.2, ease: "easeIn" }}
                className="text-6xl mb-4 invert-protect"
              >
                {avatar}
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-2"
              >
                <Ban className="w-5 h-5 text-destructive" />
                <p className="text-lg font-display font-bold text-destructive">
                  {username}
                </p>
                <Ban className="w-5 h-5 text-destructive" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-sm text-muted-foreground mt-2"
              >
                has been removed from the squadron
              </motion.p>
            </motion.div>
          )}

          {/* Phase 3: Loser message */}
          {(phase === "message" || phase === "done") && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: phase === "done" ? 0 : 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="flex flex-col items-center"
            >
              <Skull className="w-12 h-12 text-destructive mb-3" />
              <p className="text-xl font-display font-bold text-destructive">
                GET OUT
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <span className="invert-protect">🚫</span> {username} is gone
              </p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-xs text-muted-foreground/60 mt-2 italic"
              >
                What a loser...
              </motion.p>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }
);

MemberEjectedAnimation.displayName = "MemberEjectedAnimation";

export default MemberEjectedAnimation;
