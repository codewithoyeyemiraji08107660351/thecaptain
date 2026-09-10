import { useState, useEffect, useRef, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Flag } from "lucide-react";
import { playDepartureSound } from "@/lib/sounds";

interface MemberDepartureAnimationProps {
  open: boolean;
  username: string;
  avatar: string;
  onComplete: () => void;
}

const MemberDepartureAnimation = forwardRef<HTMLDivElement, MemberDepartureAnimationProps>(
  ({ open, username, avatar, onComplete }, ref) => {
    const [phase, setPhase] = useState<"enter" | "wave" | "fade" | "done">("enter");
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
      onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
      if (!open) {
        setPhase("enter");
        return;
      }
      setPhase("enter");
      playDepartureSound();
      const t1 = setTimeout(() => setPhase("wave"), 600);
      const t2 = setTimeout(() => setPhase("fade"), 2000);
      const t3 = setTimeout(() => setPhase("done"), 2800);
      const t4 = setTimeout(() => onCompleteRef.current(), 3000);
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
          {/* Phase 1: Enter with avatar */}
          {phase === "enter" && (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
                className="text-6xl mb-4 invert-protect"
              >
                {avatar}
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-display font-bold text-foreground"
              >
                {username}
              </motion.p>
            </>
          )}

          {/* Phase 2: Wave goodbye */}
          {phase === "wave" && (
            <motion.div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 1 }}
                animate={{ 
                  scale: [1, 0.9, 1],
                  x: [0, 30, 60, 90, 120],
                  opacity: [1, 1, 0.8, 0.5, 0.3]
                }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="text-6xl mb-4 invert-protect"
              >
                {avatar}
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <Flag className="w-5 h-5 text-muted-foreground" />
                <p className="text-lg font-display text-muted-foreground">
                  {username} has left the squadron
                </p>
                <LogOut className="w-5 h-5 text-muted-foreground" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-muted-foreground/60 mt-2 italic"
              >
                Farewell, pleb...
              </motion.p>
            </motion.div>
          )}

          {/* Phase 3: Fade out message */}
          {(phase === "fade" || phase === "done") && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: phase === "done" ? 0 : 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <motion.span className="text-5xl mb-4 invert-protect">🏳️</motion.span>
              <p className="text-lg font-display text-muted-foreground">
                {username} abandoned ship
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }
);

MemberDepartureAnimation.displayName = "MemberDepartureAnimation";

export default MemberDepartureAnimation;
