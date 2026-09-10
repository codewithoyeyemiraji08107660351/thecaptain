import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Crown } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playCommandIssuedSound, playCommandTargetSound, playLegendaryThunderSound } from "@/lib/sounds";

export interface LegendaryCommandEvent {
  id: string;
  captainId: string;
  targetId: string;
  prompt: string;
  timestamp: number;
  audienceUserIds?: string[];
  seenByUserIds?: string[];
  isLegendary?: boolean;
}

interface LegendaryCommandAnimationProps {
  event: LegendaryCommandEvent | null;
  members: User[];
  onComplete: () => void;
  personalTheme?: string;
}

const LegendaryCommandAnimation = ({ event, members, onComplete, personalTheme = "default" }: LegendaryCommandAnimationProps) => {
  const isSilver = personalTheme === "golden_command";
  const glowColor = isSilver ? "silver" : "gold";
  const glowRgba = isSilver ? "rgba(192,192,192," : "rgba(255,215,0,";
  const [phase, setPhase] = useState<"enter" | "strike" | "target" | "prompt" | "done">("enter");

  useEffect(() => {
    if (!event) { setPhase("enter"); return; }
    setPhase("enter");
    playLegendaryThunderSound();
    const t1 = setTimeout(() => setPhase("strike"), 600);
    const t2 = setTimeout(() => { setPhase("target"); playCommandTargetSound(); playLegendaryThunderSound(); }, 1400);
    const t3 = setTimeout(() => setPhase("prompt"), 2200);
    const t4 = setTimeout(() => setPhase("done"), 4000);
    const t5 = setTimeout(onComplete, 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [event]);

  if (!event) return null;

  const captain = members.find(m => m.id === event.captainId);
  const target = members.find(m => m.id === event.targetId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: `radial-gradient(ellipse at center, ${glowRgba}0.15) 0%, rgba(0,0,0,0.95) 70%)`,
      }}
    >
      {/* Golden particle shimmer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: glowColor,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              boxShadow: `0 0 6px 2px ${glowColor}`,
            }}
            animate={{
              y: [0, -100, -200],
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center px-6 max-w-sm relative z-10">
        {/* Title */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: 1 }}
          transition={{ duration: 0.6, type: "spring", bounce: 0.5 }}
          className="flex items-center gap-2 mb-8"
        >
          <Crown className="w-6 h-6 invert-protect" style={{ color: glowColor }} />
          <span
            className="text-lg font-display font-black tracking-[0.2em] uppercase"
            style={{
              color: glowColor,
              textShadow: `0 0 20px ${glowRgba}0.6), 0 0 40px ${glowRgba}0.3)`,
            }}
          >
            Legendary Command
          </span>
          <Crown className="w-6 h-6 invert-protect" style={{ color: glowColor }} />
        </motion.div>

        {/* Captain */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center mb-2"
        >
          <span className="text-5xl mb-1 invert-protect">{captain?.avatar || "🧑"}</span>
          <p className="text-xs font-display font-bold" style={{ color: glowColor }}>{captain?.username || "Captain"}</p>
        </motion.div>

        {/* Lightning */}
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
                    `0 0 10px ${glowColor}`,
                    `0 0 30px ${glowColor}`,
                    `0 0 10px ${glowColor}`,
                  ],
                }}
                transition={{ duration: 0.6, repeat: 3 }}
                className="text-4xl"
              >
                <span className="invert-protect">⚡</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Target */}
        <AnimatePresence>
          {(phase === "target" || phase === "prompt" || phase === "done") && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: 1 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.5 }}
              className="flex flex-col items-center mb-4"
            >
              <div
                className="rounded-full p-1"
                style={{ boxShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowRgba}0.3)` }}
              >
                <span className="text-5xl invert-protect">{target?.avatar || "🧑"}</span>
              </div>
              <p className="text-xs font-display font-bold mt-1" style={{ color: glowColor }}>{target?.username || "Target"}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt */}
        <AnimatePresence>
          {(phase === "prompt" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-2 text-center"
            >
              <p className="text-[10px] mb-1 uppercase tracking-wider" style={{ color: glowColor }}>
                ✨ Legendary Mission ✨
              </p>
              <p className="text-sm font-display font-bold text-foreground leading-snug">
                "{event.prompt}"
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Counts as completing <strong style={{ color: glowColor }}>2 commands</strong> + 1 action credit!
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default LegendaryCommandAnimation;
