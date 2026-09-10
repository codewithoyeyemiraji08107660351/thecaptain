import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Anchor, Shield, Swords } from "lucide-react";
import SignupDialog from "@/components/SignupDialog";
import LoginDialog from "@/components/LoginDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { playChaosSound, playBoatHornSound, playJoinRanksSound, playDeploySound } from "@/lib/sounds";

const CHAOS_WORDS = [
  "OBEY", "COMMAND", "SERVE", "CAPTAIN", "DEPLOY",
  "MUTINY", "RANK UP", "MISSION", "⚓", "💀",
  "SQUAD", "ADMIRAL", "PLEB", "⚔️", "🏴‍☠️",
];

const FEATURE_PILLS = [
  "Create Squads", "Become The Captain", "Command Friends",
  "Complete Missions", "Earn Badges", "Get Promotions", "Don't Fail",
];

const BOUNCE_COLORS = ["#4ade80", "#f97316", "#3b82f6", "#eab308", "#ec4899", "#8b5cf6", "#06b6d4"];

const LandingPage = () => {
  const { user, isReady } = useAuth();
  const navigate = useNavigate();
  const [showSignup, setShowSignup] = useState(false);
  const [showLogin, setShowLogin] = useState(false);


  // Redirect authenticated users to squads
  useEffect(() => {
    if (isReady && user) navigate("/squads", { replace: true });
  }, [isReady, user, navigate]);

  const [_fxActive, _setFxActive] = useState(false);
  const [shoutout, setShoutout] = useState(false);
  const _tc = useRef(0);
  const _tt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _atc = useRef(0);
  const _att = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleTap = useCallback(() => {
    if (_fxActive) return;
    _tc.current += 1;
    if (_tt.current) clearTimeout(_tt.current);
    _tt.current = setTimeout(() => { _tc.current = 0; }, 1500);
    if (_tc.current >= 7) {
      _tc.current = 0;
      _setFxActive(true);
      playChaosSound();
    }
  }, [_fxActive]);

  const handleAnchorTap = useCallback(() => {
    _atc.current += 1;
    if (_att.current) clearTimeout(_att.current);
    _att.current = setTimeout(() => { _atc.current = 0; }, 1500);
    if (_atc.current >= 7) {
      _atc.current = 0;
      setShoutout(true);
      playBoatHornSound();
      setTimeout(() => setShoutout(false), 5000);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      {/* Shoutout Easter Egg */}
      <AnimatePresence>
        {shoutout && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-primary/20 border border-primary/40 backdrop-blur-sm"
          >
            <p className="text-primary font-display font-bold text-sm text-center">Shout out to FTB - SwiftyKhuzz ⚓</p>
          </motion.div>
        )}
      </AnimatePresence>

      {_fxActive && (
        <ChaosBounce onClose={() => _setFxActive(false)} />
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center max-w-2xl w-full"
      >
        {/* Floating anchor icon */}
        <motion.button
          onClick={handleAnchorTap}
          className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-6 sm:mb-8 animate-card-float cursor-pointer"
        >
          <Anchor className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
        </motion.button>

        <h1
          className="text-4xl sm:text-5xl md:text-7xl font-bold font-display tracking-tight mb-3 sm:mb-4 cursor-pointer select-none"
          onClick={handleTitleTap}
        >
          <span className="text-gradient-primary">THE CAPTAIN</span>
        </h1>

        <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-2 font-medium italic">
          Look at me, I'm the Captain now
        </p>
        <p className="text-sm sm:text-base text-muted-foreground mb-8 sm:mb-10 max-w-md mx-auto px-2">
          Challenge your friends, survive the commands, and fight to control the game. Power shifts. Respect doesn't.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-12 sm:mb-16 px-4 sm:px-0">
          <Button variant="hero" size="lg" className="text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6" onClick={() => { playJoinRanksSound(); setShowSignup(true); }}>
            <Shield className="w-5 h-5 mr-2" />
            Join The Ranks
          </Button>
          <Button variant="outline" size="lg" className="text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6" onClick={() => { playDeploySound(); setShowLogin(true); }}>
            <Swords className="w-5 h-5 mr-2" />
            Deploy
          </Button>
        </div>

        {/* Infinite seamless carousel of feature pills */}
        <div className="overflow-hidden w-full py-4">
          <motion.div
            className="flex gap-4 whitespace-nowrap"
            animate={{ x: [0, -1400] }}
            transition={{ duration: 20, ease: "linear", repeat: Infinity }}
          >
            {[...FEATURE_PILLS, ...FEATURE_PILLS, ...FEATURE_PILLS, ...FEATURE_PILLS].map((feature, i) => (
              <motion.span
                key={`${feature}-${i}`}
                className="inline-block px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium border border-border shrink-0"
                animate={{
                  y: [0, -6, 0, 4, 0],
                }}
                transition={{
                  duration: 3 + (i % 3) * 0.5,
                  ease: "easeInOut",
                  repeat: Infinity,
                  delay: (i % 7) * 0.4,
                }}
              >
                {feature}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </motion.div>

      <SignupDialog open={showSignup} onOpenChange={setShowSignup} />
      <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
    </div>
  );
};

// Bouncing chaos words — DVD screensaver style, infinite until tap
const STROBE_COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#ffff00", "#00ffff", "#ff8800"];

const ChaosBounce = ({ onClose }: { onClose: () => void }) => {
  const [items, setItems] = useState<{ id: number; text: string; x: number; y: number; vx: number; vy: number; rotation: number; vr: number; color: string }[]>([]);
  const [strobeIdx, setStrobeIdx] = useState(0);
  const animRef = useRef<number>();
  const strobeRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Items start off-screen at random edges
    const newItems = CHAOS_WORDS.map((word, i) => {
      const edge = Math.floor(Math.random() * 4); // 0=top,1=right,2=bottom,3=left
      let x: number, y: number;
      if (edge === 0) { x = Math.random() * window.innerWidth; y = -60; }
      else if (edge === 1) { x = window.innerWidth + 60; y = Math.random() * window.innerHeight; }
      else if (edge === 2) { x = Math.random() * window.innerWidth; y = window.innerHeight + 60; }
      else { x = -120; y = Math.random() * window.innerHeight; }
      return {
        id: i, text: word, x, y,
        vx: (Math.random() - 0.5) * 4 + (edge === 3 ? 3 : edge === 1 ? -3 : 0),
        vy: (Math.random() - 0.5) * 4 + (edge === 0 ? 3 : edge === 2 ? -3 : 0),
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 8,
        color: BOUNCE_COLORS[i % BOUNCE_COLORS.length],
      };
    });
    setItems(newItems);

    // Strobe lights
    strobeRef.current = setInterval(() => {
      setStrobeIdx(prev => (prev + 1) % STROBE_COLORS.length);
    }, 150);

    const animate = () => {
      setItems(prev => prev.map(item => {
        const w = window.innerWidth - 100;
        const h = window.innerHeight - 40;
        let { x, y, vx, vy, rotation, vr } = item;
        x += vx; y += vy; rotation += vr;
        if (x <= 0 || x >= w) { vx *= -1; x = Math.max(0, Math.min(w, x)); vr = (Math.random() - 0.5) * 10; }
        if (y <= 0 || y >= h) { vy *= -1; y = Math.max(0, Math.min(h, y)); vr = (Math.random() - 0.5) * 10; }
        return { ...item, x, y, vx, vy, rotation, vr };
      }));
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (strobeRef.current) clearInterval(strobeRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100]"
      onClick={onClose}
      style={{
        background: `radial-gradient(circle at 50% 50%, ${STROBE_COLORS[strobeIdx]}15, ${STROBE_COLORS[(strobeIdx + 3) % STROBE_COLORS.length]}08, rgba(0,0,0,0.92))`,
        transition: "background 0.15s ease",
      }}
    >
      {/* Strobe beams */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="absolute w-32 h-[200%] opacity-10 blur-3xl"
            style={{
              left: `${20 + i * 30}%`,
              top: "-50%",
              background: `linear-gradient(180deg, transparent, ${STROBE_COLORS[(strobeIdx + i) % STROBE_COLORS.length]}, transparent)`,
              transform: `rotate(${(strobeIdx * 8 + i * 40) % 360}deg)`,
              transition: "all 0.15s ease",
            }}
          />
        ))}
      </div>
      <p className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground z-10">Tap anywhere to close</p>
      {items.map(item => (
        <div
          key={item.id}
          className="absolute px-3 py-1.5 rounded-lg font-display font-bold shadow-lg pointer-events-none"
          style={{
            left: item.x,
            top: item.y,
            transform: `rotate(${item.rotation}deg)`,
            backgroundColor: item.color + "22",
            border: `1px solid ${item.color}55`,
            color: item.color,
            fontSize: `${16 + (item.id % 5) * 6}px`,
          }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
};

export default LandingPage;
