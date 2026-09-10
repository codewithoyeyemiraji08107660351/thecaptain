import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playChaosSound } from "@/lib/sounds";

const DURATION = 6000;

const _W = [
  "💀", "🔥", "⚡", "💣", "☠️", "🌋", "🌊", "👹", "😈", "🤯",
  "MUTINY", "CHAOS", "ABANDON SHIP", "MAYDAY", "SOS", "OVERBOARD",
  "🏴‍☠️", "⚓", "🦈", "🐙", "KRAKEN", "STORM", "THUNDER", "DOOM",
];

const COLORS = [
  "#ff0040", "#ff6600", "#ffcc00", "#00ff66", "#00ccff",
  "#6600ff", "#ff00cc", "#ff3333", "#00ffaa", "#ff9900",
];

interface FloatingElement {
  id: number;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  dx: number;
  dy: number;
}

const OverlayFX = ({ open, onComplete }: { open: boolean; onComplete: () => void }) => {
  const [elements, setElements] = useState<FloatingElement[]>([]);
  const [screenShake, setScreenShake] = useState(0);
  const [strobeColor, setStrobeColor] = useState<string | null>(null);
  const [phase, setPhase] = useState(0); // escalation phases
  const frameRef = useRef<number>(0);
  const elementsRef = useRef<FloatingElement[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!open) {
      setElements([]);
      setScreenShake(0);
      setStrobeColor(null);
      setPhase(0);
      return;
    }

    playChaosSound();

    // Spawn initial elements
    const initialElements: FloatingElement[] = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      text: _W[Math.floor(Math.random() * _W.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 16 + Math.random() * 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      dx: (Math.random() - 0.5) * 4,
      dy: (Math.random() - 0.5) * 4,
    }));
    elementsRef.current = initialElements;
    setElements(initialElements);

    // Animation loop — move elements, shake screen
    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;

      elementsRef.current = elementsRef.current.map(el => {
        let nx = el.x + el.dx * dt;
        let ny = el.y + el.dy * dt;
        let ndx = el.dx;
        let ndy = el.dy;
        if (nx < -5 || nx > 105) ndx = -ndx;
        if (ny < -5 || ny > 105) ndy = -ndy;
        return {
          ...el,
          x: nx, y: ny, dx: ndx, dy: ndy,
          rotation: el.rotation + (Math.random() - 0.5) * 10 * dt,
        };
      });
      setElements([...elementsRef.current]);
      setScreenShake((Math.random() - 0.5) * 20);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    // Strobe effect
    const strobeInterval = setInterval(() => {
      setStrobeColor(Math.random() > 0.4 ? COLORS[Math.floor(Math.random() * COLORS.length)] : null);
    }, 120);

    // Escalation phases
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 3000);
    const t3 = setTimeout(() => setPhase(3), 4800);

    // Spawn more elements over time
    const spawnInterval = setInterval(() => {
      const newEl: FloatingElement = {
        id: Date.now() + Math.random(),
        text: _W[Math.floor(Math.random() * _W.length)],
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 20 + Math.random() * 50,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        dx: (Math.random() - 0.5) * 6,
        dy: (Math.random() - 0.5) * 6,
      };
      elementsRef.current = [...elementsRef.current.slice(-60), newEl];
    }, 200);

    // End
    const endTimer = setTimeout(() => {
      onCompleteRef.current();
    }, DURATION);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearInterval(strobeInterval);
      clearInterval(spawnInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(endTimer);
    };
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] overflow-hidden select-none"
        style={{
          pointerEvents: "all",
          background: strobeColor
            ? `${strobeColor}22`
            : "rgba(0,0,0,0.95)",
          transform: `translate(${screenShake}px, ${screenShake * 0.7}px)`,
        }}
      >
        {/* Background pulse rings */}
        {phase >= 1 && (
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2"
                style={{ borderColor: COLORS[i % COLORS.length] }}
                initial={{ width: 0, height: 0, opacity: 0.8 }}
                animate={{
                  width: [0, 800, 1600],
                  height: [0, 800, 1600],
                  opacity: [0.6, 0.3, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.6,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        )}

        {/* Floating chaos elements */}
        {elements.map(el => (
          <div
            key={el.id}
            className="absolute font-display font-black whitespace-nowrap invert-protect"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              fontSize: `${el.size}px`,
              color: el.color,
              transform: `rotate(${el.rotation}deg)`,
              textShadow: `0 0 ${10 + phase * 5}px ${el.color}, 0 0 ${20 + phase * 10}px ${el.color}`,
              filter: phase >= 2 ? `blur(${Math.random() > 0.7 ? 2 : 0}px)` : undefined,
              transition: "none",
            }}
          >
            {el.text}
          </div>
        ))}

        {/* Central chaos text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{
              scale: [1, 1.3, 0.8, 1.5, 1],
              rotate: [0, -15, 15, -10, 0],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-center"
          >
            <p
              className="text-6xl font-display font-black tracking-wider"
              style={{
                color: COLORS[phase % COLORS.length],
                textShadow: `0 0 30px ${COLORS[(phase + 1) % COLORS.length]}, 0 0 60px ${COLORS[(phase + 2) % COLORS.length]}`,
              }}
            >
              {phase >= 3 ? "💀 TOTAL CHAOS 💀" : phase >= 2 ? "🔥 HELL BREAKS LOOSE 🔥" : phase >= 1 ? "⚡ BRACE YOURSELVES ⚡" : "🌊 INCOMING STORM 🌊"}
            </p>
          </motion.div>
        </div>

        {/* Glitch lines */}
        {phase >= 2 && Array.from({ length: 5 }).map((_, i) => (
          <motion.div
            key={`glitch-${i}`}
            className="absolute left-0 right-0"
            style={{
              height: 2 + Math.random() * 4,
              background: COLORS[Math.floor(Math.random() * COLORS.length)],
              top: `${Math.random() * 100}%`,
              opacity: 0.6,
            }}
            animate={{
              x: [-100, 100, -50, 200, 0],
              opacity: [0.6, 0, 0.8, 0, 0.4],
            }}
            transition={{
              duration: 0.3,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}

        {/* Countdown */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <motion.p
            className="text-xs text-muted-foreground/60 font-mono"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            SYSTEM MELTDOWN IN PROGRESS...
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OverlayFX;
