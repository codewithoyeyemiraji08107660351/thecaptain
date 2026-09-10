import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, RotateCcw, Zap, Target } from "lucide-react";
import type { User } from "@/lib/mockData";
import { playShieldActionSound, playFriendlyFireActionSound, playPowerTripActionSound, playStrayBulletActionSound } from "@/lib/sounds";

export interface ActionEvent {
  id: string;
  action: "shield" | "friendly_fire" | "power_trip" | "stray_bullet";
  actorId: string;
  targetId?: string; // who gets the command forwarded to (or shielded user)
  timestamp: number;
}

const actionConfig = {
  shield: { icon: Shield, label: "SHIELD", emoji: "🛡️", color: "hsl(210 80% 55%)" },
  friendly_fire: { icon: RotateCcw, label: "FRIENDLY FIRE", emoji: "🔄", color: "hsl(40 90% 55%)" },
  power_trip: { icon: Zap, label: "POWER TRIP", emoji: "⚡", color: "hsl(280 80% 60%)" },
  stray_bullet: { icon: Target, label: "STRAY BULLET", emoji: "🔫", color: "hsl(0 70% 55%)" },
};

interface ActionAnimationProps {
  event: ActionEvent | null;
  members: User[];
  onComplete: () => void;
}

const ActionAnimation = ({ event, members, onComplete }: ActionAnimationProps) => {
  const [phase, setPhase] = useState<"enter" | "action" | "result" | "done">("enter");

  useEffect(() => {
    if (!event) { setPhase("enter"); return; }
    setPhase("enter");
    // Play the matching action sound on enter
    const soundMap = { shield: playShieldActionSound, friendly_fire: playFriendlyFireActionSound, power_trip: playPowerTripActionSound, stray_bullet: playStrayBulletActionSound };
    soundMap[event.action]?.();
    const t1 = setTimeout(() => setPhase("action"), 400);
    const t2 = setTimeout(() => setPhase("result"), 1400);
    const t3 = setTimeout(() => setPhase("done"), 2600);
    const t4 = setTimeout(onComplete, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [event]);

  if (!event) return null;

  const config = actionConfig[event.action];
  const Icon = config.icon;
  const actor = members.find(m => m.id === event.actorId);
  const target = event.targetId ? members.find(m => m.id === event.targetId) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
    >
      <div className="flex flex-col items-center">
        {/* Title */}
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-display font-bold tracking-wider mb-6"
          style={{ color: config.color }}
        >
          <span className="invert-protect">{config.emoji}</span> {config.label} <span className="invert-protect">{config.emoji}</span>
        </motion.p>

        {/* Actor */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center mb-4"
        >
          <span className="text-5xl mb-1 invert-protect">{actor?.avatar || "🧑"}</span>
          <p className="text-sm font-display font-bold">{actor?.username || "Unknown"}</p>
        </motion.div>

        {/* Action icon */}
        <AnimatePresence>
          {(phase === "action" || phase === "result" || phase === "done") && (
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: [0, 1.5, 1], rotate: 0 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="my-4"
            >
              <Icon className="w-12 h-12" style={{ color: config.color }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {(phase === "result" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center mt-2"
            >
              {event.action === "shield" ? (
                <p className="text-sm font-bold text-center" style={{ color: config.color }}>
                  Command blocked! Immune until next round.
                </p>
              ) : target ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">Command forwarded to:</p>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-5xl mb-1 invert-protect">{target.avatar}</span>
                    <p className="text-sm font-display font-bold" style={{ color: config.color }}>
                      {target.username}
                    </p>
                  </motion.div>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ActionAnimation;
