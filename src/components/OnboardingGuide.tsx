import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Zap, Crown, ShoppingBag, Users, X } from "lucide-react";

interface OnboardingGuideProps {
  userId: string | undefined;
  squadCount: number;
}

const STEPS = [
  {
    icon: Users,
    title: "Welcome aboard, Sailor! ⚓",
    description: "You've joined your first squad. Here's a quick rundown of how The Captain works.",
  },
  {
    icon: Crown,
    title: "The Captain holds the power",
    description: "The Captain issues commands to crew members. Complete commands to rank up and eventually become The Captain yourself!",
  },
  {
    icon: Zap,
    title: "Actions & Super Actions",
    description: "Use Action Credits to Shield, Friendly Fire, Power Trip, or Stray Bullet. Super Actions like Coup D'état can steal captaincy!",
  },
  {
    icon: ShoppingBag,
    title: "Daily Spin & Shop",
    description: "Spin the wheel daily for free rewards. Visit the Shop to top up credits. Good luck, sailor!",
  },
];

const OnboardingGuide = ({ userId, squadCount }: OnboardingGuideProps) => {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const key = `onboarding_seen_${userId}`;
    const seen = localStorage.getItem(key);
    if (!seen && squadCount === 1) {
      setDismissed(false);
    }
  }, [userId, squadCount]);

  const handleDismiss = () => {
    if (userId) localStorage.setItem(`onboarding_seen_${userId}`, "true");
    setDismissed(true);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  if (dismissed) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full text-center space-y-4 relative"
        >
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Icon className="w-7 h-7 text-primary" />
          </div>

          <h3 className="font-display font-bold text-lg">{current.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

          <div className="flex items-center justify-center gap-1.5 py-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>

          <Button variant="hero" className="w-full" onClick={handleNext}>
            {step < STEPS.length - 1 ? "Next" : "Let's Go! ⚓"}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OnboardingGuide;
