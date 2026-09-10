import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, RotateCcw, Zap, Target } from "lucide-react";
import {
  playActionButtonSound, playShieldActionSound, playFriendlyFireActionSound,
  playPowerTripActionSound, playStrayBulletActionSound, playSpinWheelSound,
} from "@/lib/sounds";
import type { User } from "@/lib/mockData";
import { DEV_UNLIMITED_ACTION_CREDITS as DEV_UNLIMITED_CREDITS } from "@/lib/dev-config";

export type ActionType = "shield" | "friendly_fire" | "power_trip" | "stray_bullet";

interface ActionSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: number;
  onSelectAction: (action: ActionType) => void;
}

const actionSounds: Record<ActionType, () => void> = {
  shield: playShieldActionSound,
  friendly_fire: playFriendlyFireActionSound,
  power_trip: playPowerTripActionSound,
  stray_bullet: playStrayBulletActionSound,
};

const ActionSelector = ({ open, onOpenChange, credits, onSelectAction }: ActionSelectorProps) => {
  const actions: { type: ActionType; icon: React.ReactNode; name: string; desc: string }[] = [
    { type: "shield", icon: <Shield className="w-5 h-5" />, name: "Shield", desc: "Block a command" },
    { type: "friendly_fire", icon: <RotateCcw className="w-5 h-5" />, name: "Friendly Fire", desc: "Forward command to a random same rank or lower" },
    { type: "power_trip", icon: <Zap className="w-5 h-5" />, name: "Power Trip", desc: "Forward command to the lowest rank" },
    { type: "stray_bullet", icon: <Target className="w-5 h-5" />, name: "Stray Bullet", desc: "Spin the Wheel - Get the command" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            Use Action
            <span className="text-xs font-normal text-muted-foreground ml-auto">{DEV_UNLIMITED_CREDITS ? "∞" : credits} credit{!DEV_UNLIMITED_CREDITS && credits !== 1 ? "s" : ""}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          {actions.map(a => (
            <button
              key={a.type}
              className="w-full p-3 rounded-xl bg-secondary/50 border border-border hover:border-accent/40 transition-all text-left flex items-center gap-3"
              onClick={() => { actionSounds[a.type](); onSelectAction(a.type); }}
              disabled={!DEV_UNLIMITED_CREDITS && credits < 1}
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </div>
              <span className="text-xs text-accent font-semibold shrink-0">1 ⚡</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActionSelector;

// Spin wheel component for Stray Bullet
interface SpinWheelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: User[];
  currentUserId: string;
  captainIds: string[];
  excludeUserIds?: string[];
  onResult: (selectedUser: User) => void;
}

export const SpinWheel = ({ open, onOpenChange, members, currentUserId, captainIds, excludeUserIds = [], onResult }: SpinWheelProps) => {
  const [spinning, setSpinning] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [finalRotation, setFinalRotation] = useState(0);
  const spinCountRef = useRef(0);

  const excludeSet = new Set([...captainIds, ...excludeUserIds]);
  const eligible = members.filter(m => !excludeSet.has(m.id));

  const startSpin = () => {
    if (spinning || eligible.length === 0) return;
    playSpinWheelSound();
    setSpinning(true);
    setSelectedIdx(null);

    const target = Math.floor(Math.random() * eligible.length);
    const anglePerSlice = 360 / eligible.length;
    // Each member i sits at angle (i * anglePerSlice) from top (0°).
    // To bring member `target` to the top (arrow), we rotate by -(target * anglePerSlice),
    // plus full rotations for drama. We use a half-slice offset so arrow points at center of the icon.
    const baseSpins = (spinCountRef.current + 1) * 1440; // always enough full rotations
    const landAngle = -(target * anglePerSlice);
    const totalRotation = baseSpins + landAngle;
    spinCountRef.current += 1;
    setFinalRotation(totalRotation);

    // Delay result until CSS transition ends (3s) + buffer
    setTimeout(() => {
      setSelectedIdx(target);
      setSpinning(false);
      setTimeout(() => onResult(eligible[target]), 1200);
    }, 3200);
  };

  if (!open) return null;

  const sliceAngle = 360 / eligible.length;
  // Radius for placing icons — use half of container minus icon half-size
  const radius = 88; // slightly less than half of 224px (w-56)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!spinning) onOpenChange(o); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display text-center">🔫 Stray Bullet</DialogTitle>
        </DialogHeader>

        {/* Wheel */}
        <div className="relative w-full flex flex-col items-center">
          {/* Arrow indicator at top center — points down into the wheel */}
          <div className="text-accent text-2xl z-10 mb-[-4px]">▼</div>

          <div className="relative w-56 h-56 rounded-full border-2 border-border bg-secondary/20">
            <div
              className="absolute inset-0"
              style={{
                transform: `rotate(${finalRotation}deg)`,
                transition: spinning ? "transform 3s cubic-bezier(0.2, 0.8, 0.3, 1)" : "none",
              }}
            >
              {eligible.map((m, i) => {
                const angleDeg = i * sliceAngle;
                const angleRad = (angleDeg - 90) * (Math.PI / 180); // -90 so 0° = top
                const cx = 112 + radius * Math.cos(angleRad); // 112 = half of 224
                const cy = 112 + radius * Math.sin(angleRad);
                const isSelected = selectedIdx === i;

                return (
                  <div
                    key={m.id}
                    className="absolute"
                    style={{
                      left: cx,
                      top: cy,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${
                        isSelected ? "bg-accent/30 border-2 border-accent scale-150 shadow-lg shadow-accent/30" :
                        "bg-secondary/50 border border-border"
                      }`}
                    >
                      <span className={isSelected ? "animate-bounce" : ""}>{m.avatar}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedIdx !== null && (
          <p className="text-center text-sm font-bold mt-2 animate-pulse">
            {eligible[selectedIdx].id === currentUserId
              ? "🔫 Landed on you! You can't use Stray Bullet next time."
              : `${eligible[selectedIdx].avatar} ${eligible[selectedIdx].username} takes the hit!`}
          </p>
        )}

        {selectedIdx === null && (
          <Button variant="serve" className="w-full mt-2" onClick={startSpin} disabled={spinning}>
            {spinning ? "Spinning..." : "Spin!"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};
