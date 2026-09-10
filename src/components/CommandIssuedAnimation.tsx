import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playCommandIssuedSound, playCommandTargetSound } from "@/lib/sounds";

export interface CommandEvent {
  id: string;
  captainId: string;
  targetId: string;
  prompt: string;
  timestamp: number;
  audienceUserIds?: string[];
  seenByUserIds?: string[];
  isLegendary?: boolean; // ✅ Add optional legendary flag
}

interface CommandIssuedAnimationProps {
  event: CommandEvent | null; // ✅ Use CommandEvent type directly
  members: User[];
  onComplete: () => void;
}

const CommandIssuedAnimation = ({ event, members, onComplete }: CommandIssuedAnimationProps) => {
  const [phase, setPhase] = useState<"enter" | "strike" | "target" | "prompt" | "done">("enter");

  useEffect(() => {
    if (!event) {
      setPhase("enter");
      return;
    }
    
    setPhase("enter");
    playCommandIssuedSound();
    
    const t1 = setTimeout(() => setPhase("strike"), 500);
    const t2 = setTimeout(() => { 
      setPhase("target"); 
      playCommandTargetSound(); 
    }, 1200);
    const t3 = setTimeout(() => setPhase("prompt"), 2000);
    const t4 = setTimeout(() => setPhase("done"), 3500);
    const t5 = setTimeout(onComplete, 4000);
    
    return () => { 
      clearTimeout(t1); 
      clearTimeout(t2); 
      clearTimeout(t3); 
      clearTimeout(t4); 
      clearTimeout(t5); 
    };
  }, [event, onComplete]);

  if (!event) return null;

  const captain = members.find(m => m.id === event.captainId);
  const target = members.find(m => m.id === event.targetId);

  // ✅ Handle case where captain or target not found
  if (!captain || !target) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
    >
      <div className="flex flex-col items-center px-6 max-w-sm">
        {/* Title flash */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.3, 1], opacity: 1 }}
          transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
          className="flex items-center gap-2 mb-8"
        >
          <Zap className="w-5 h-5 text-primary fill-primary invert-protect" />
          <span className="text-sm font-display font-bold tracking-[0.3em] text-primary uppercase">
            {event.isLegendary ? "⚡ LEGENDARY COMMAND ⚡" : "Command Issued"}
          </span>
          <Zap className="w-5 h-5 text-primary fill-primary invert-protect" />
        </motion.div>

        {/* Captain */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center mb-2"
        >
          <span className="text-5xl mb-1 invert-protect">{captain.avatar}</span>
          <p className="text-xs font-display font-bold text-primary">{captain.username}</p>
        </motion.div>

        {/* Lightning bolt strike */}
        <AnimatePresence>
          {(phase === "strike" || phase === "target" || phase === "prompt" || phase === "done") && (
            <motion.div
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.5 }}
              className="my-3 flex flex-col items-center origin-top"
            >
              <motion.div
                animate={{ 
                  textShadow: [
                    "0 0 8px hsl(var(--primary) / 0.8)",
                    "0 0 20px hsl(var(--primary) / 1)",
                    "0 0 8px hsl(var(--primary) / 0.8)",
                  ]
                }}
                transition={{ duration: 0.8, repeat: 2 }}
                className="text-4xl"
              >
                <span className="invert-protect">⚡</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Target reveal */}
        <AnimatePresence>
          {(phase === "target" || phase === "prompt" || phase === "done") && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], opacity: 1 }}
              transition={{ duration: 0.4, type: "spring", bounce: 0.5 }}
              className="flex flex-col items-center mb-4"
            >
              <span className="text-5xl mb-1 invert-protect">{target.avatar}</span>
              <p className="text-xs font-display font-bold text-accent">{target.username}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Command prompt text */}
        <AnimatePresence>
          {(phase === "prompt" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-2 text-center"
            >
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Mission:</p>
              <motion.p 
                className={`text-sm font-display font-bold leading-snug ${event.isLegendary ? 'text-yellow-400' : 'text-foreground'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                "{event.prompt}"
                {event.isLegendary && (
                  <span className="ml-2 text-xs text-yellow-400">✨ LEGENDARY ✨</span>
                )}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default CommandIssuedAnimation;