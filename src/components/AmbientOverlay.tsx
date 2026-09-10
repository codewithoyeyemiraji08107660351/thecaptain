import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playWaterFillSound, playUnderwaterBubblesSound, playSubmarineBeepSound } from "@/lib/sounds";

const DURATION = 10000;
const FISH = ["🐠", "🐟", "🐡", "🦀", "🐙", "🦑", "🐚", "🦐", "🐳"];
const SEAWEED = ["🌿", "🪸", "🌊"];

interface Fish {
  id: number;
  emoji: string;
  fromLeft: boolean;
  y: number;
  speed: number;
  delay: number;
  size: number;
}

const generateFish = (): Fish[] =>
  Array.from({ length: 18 }, (_, i) => ({
    id: i,
    emoji: FISH[Math.floor(Math.random() * FISH.length)],
    fromLeft: Math.random() > 0.5,
    y: 30 + Math.random() * 60,
    speed: 3 + Math.random() * 4,
    delay: 2 + Math.random() * 6,
    size: 18 + Math.random() * 24,
  }));

const AmbientOverlay = ({ open, onComplete }: { open: boolean; onComplete: () => void }) => {
  const [waterLevel, setWaterLevel] = useState(0);
  const [fish] = useState<Fish[]>(generateFish);
  const [showSubmarine, setShowSubmarine] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!open) {
      setWaterLevel(0);
      setShowSubmarine(false);
      return;
    }

    playWaterFillSound();

    // Water fills up over 2 seconds
    const waterStart = performance.now();
    const fillWater = (now: number) => {
      const elapsed = now - waterStart;
      const progress = Math.min(elapsed / 2000, 1);
      setWaterLevel(progress * 100);
      if (progress < 1) animRef.current = requestAnimationFrame(fillWater);
    };
    animRef.current = requestAnimationFrame(fillWater);

    // Bubbles sound
    const bubbleTimers = [1000, 2500, 4000, 5500, 7000, 8500].map(t =>
      setTimeout(() => playUnderwaterBubblesSound(), t)
    );

    // Submarine at 7s
    const subTimer = setTimeout(() => {
      setShowSubmarine(true);
      playSubmarineBeepSound();
    }, 7000);

    // End
    const endTimer = setTimeout(() => {
      onCompleteRef.current();
    }, DURATION);

    return () => {
      cancelAnimationFrame(animRef.current);
      bubbleTimers.forEach(clearTimeout);
      clearTimeout(subTimer);
      clearTimeout(endTimer);
    };
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.5 } }}
        className="fixed inset-0 z-[250] pointer-events-none overflow-hidden"
      >
        {/* Water fills from bottom */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${waterLevel}%`,
            background: "linear-gradient(to bottom, hsla(200, 80%, 55%, 0.25), hsla(210, 85%, 25%, 0.5))",
            transition: waterLevel < 100 ? "none" : "height 0.5s ease",
          }}
        >
          {/* Surface shimmer */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-3"
            style={{ background: "linear-gradient(to bottom, hsla(195, 90%, 65%, 0.45), transparent)" }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />

          {/* Rising bubbles */}
          {Array.from({ length: 25 }).map((_, i) => (
            <motion.div
              key={`bubble-${i}`}
              className="absolute rounded-full"
              style={{
                width: 3 + Math.random() * 10,
                height: 3 + Math.random() * 10,
                left: `${3 + Math.random() * 94}%`,
                bottom: 0,
                background: "radial-gradient(circle at 30% 30%, hsla(0, 0%, 100%, 0.4), hsla(0, 0%, 100%, 0.1))",
                border: "1px solid hsla(0, 0%, 100%, 0.15)",
              }}
              animate={{
                y: [0, -(100 + Math.random() * 400)],
                x: [0, (Math.random() - 0.5) * 30],
                opacity: [0.7, 0],
              }}
              transition={{
                duration: 2.5 + Math.random() * 3,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: "easeOut",
              }}
            />
          ))}

          {/* Seaweed & coral at bottom */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-around px-2 pb-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <motion.span
                key={`seaweed-${i}`}
                className="invert-protect"
                style={{ fontSize: 18 + Math.random() * 14 }}
                animate={{ rotate: [-8, 8, -8] }}
                transition={{ duration: 2 + Math.random() * 1.5, repeat: Infinity, delay: Math.random() }}
              >
                {SEAWEED[i % SEAWEED.length]}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Swimming fish */}
        {fish.map(f => (
          <motion.span
            key={f.id}
            className="absolute invert-protect"
            style={{
              fontSize: f.size,
              top: `${f.y}%`,
              transform: f.fromLeft ? "scaleX(1)" : "scaleX(-1)",
            }}
            initial={{ x: f.fromLeft ? "-60px" : "calc(100vw + 60px)", opacity: 0 }}
            animate={{
              x: f.fromLeft ? "calc(100vw + 60px)" : "-60px",
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: f.speed,
              delay: f.delay,
              ease: "linear",
            }}
          >
            {f.emoji}
          </motion.span>
        ))}

        {/* Submarine */}
        {showSubmarine && (
          <motion.div
            className="absolute flex items-center"
            style={{ top: "42%" }}
            initial={{ x: "calc(100vw + 60px)" }}
            animate={{ x: "-200px" }}
            transition={{ duration: 3, ease: [0.2, 0.8, 0.4, 1] }}
          >
            <div className="relative">
              {/* Periscope */}
              <div className="absolute -top-5 left-8 w-1.5 h-5 bg-slate-500/80 rounded-sm" />
              <div className="absolute -top-7 left-7 w-3.5 h-2.5 bg-slate-500/80 rounded-sm" />
              {/* Hull */}
              <div
                className="w-28 h-10 rounded-[20px] flex items-center justify-center gap-2 shadow-lg"
                style={{
                  background: "linear-gradient(to bottom, hsl(210, 20%, 50%), hsl(210, 25%, 35%))",
                  border: "2px solid hsl(210, 20%, 40%)",
                }}
              >
                <div className="w-4 h-4 rounded-full border-2 border-yellow-400/70 bg-yellow-400/30" />
                <div className="w-4 h-4 rounded-full border-2 border-yellow-400/70 bg-yellow-400/30" />
              </div>
              {/* Propeller */}
              <motion.div
                className="absolute -right-2 top-1/2 -translate-y-1/2"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 0.3, repeat: Infinity, ease: "linear" }}
              >
                <div className="w-2 h-6 bg-slate-600/80 rounded-sm" />
              </motion.div>
            </div>
            {/* Wake bubbles trailing behind */}
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                className="absolute rounded-full bg-white/15"
                style={{ width: 5, height: 5, right: -14 - i * 10, top: 14 + (i % 2) * 6 }}
                animate={{ opacity: [0.4, 0], scale: [1, 2.5] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default AmbientOverlay;
