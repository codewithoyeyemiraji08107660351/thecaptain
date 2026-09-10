import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crown, Shuffle, Bomb, Swords } from "lucide-react";
import { playButtonSound } from "@/lib/sounds";
import { DEV_UNLIMITED_SUPER_CREDITS as DEV_UNLIMITED_CREDITS } from "@/lib/dev-config";

export type SuperActionType = "coup" | "rank_lottery" | "saboteur";

interface SuperActionSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: number;
  onSelectAction: (action: SuperActionType) => void;
  onOpenShop: () => void;
}

const SuperActionSelector = ({ open, onOpenChange, credits, onSelectAction, onOpenShop }: SuperActionSelectorProps) => {
  const actions: { type: SuperActionType; icon: React.ReactNode; name: string; desc: string }[] = [
    { type: "coup", icon: <Swords className="w-5 h-5" />, name: "Coup D'état", desc: "Steal a command & become The Captain" },
    { type: "rank_lottery", icon: <Shuffle className="w-5 h-5" />, name: "Rank Lottery", desc: "Swap ranks with a random crew member (closer ranks more likely)" },
    { type: "saboteur", icon: <Bomb className="w-5 h-5" />, name: "Saboteur", desc: "Set all current live command's time limit to 2 minutes" },
  ];

  const handleSelect = (action: SuperActionType) => {
    if (!DEV_UNLIMITED_CREDITS && credits < 1) {
      onOpenChange(false);
      onOpenShop();
      return;
    }
    playButtonSound();
    onSelectAction(action);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display flex items-center gap-2">
            <Crown className="w-5 h-5" style={{ color: "hsl(270 80% 60%)" }} />
            <span style={{ color: "hsl(270 80% 60%)" }}>Super Action</span>
            <span className="text-xs font-normal text-muted-foreground ml-auto">{DEV_UNLIMITED_CREDITS ? "∞" : credits} credit{!DEV_UNLIMITED_CREDITS && credits !== 1 ? "s" : ""}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          {actions.map(a => (
            <button
              key={a.type}
              className="w-full p-3 rounded-xl bg-secondary/50 border border-border hover:border-[hsl(270,80%,60%)]/40 transition-all text-left flex items-center gap-3"
              onClick={() => handleSelect(a.type)}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "hsl(270 80% 60% / 0.1)", color: "hsl(270 80% 60%)" }}>
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </div>
              <span className="text-xs font-semibold shrink-0 flex items-center gap-0.5" style={{ color: "hsl(270 80% 60%)" }}>
                1 <Crown className="w-3 h-3" />
              </span>
            </button>
          ))}
          {!DEV_UNLIMITED_CREDITS && credits < 1 && (
            <p className="text-[10px] text-muted-foreground text-center">No credits — selecting will open the shop</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SuperActionSelector;
