import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Lock, Sparkles, Palette } from "lucide-react";
import { SQUAD_THEMES } from "@/lib/squad-themes";
import { playButtonSound } from "@/lib/sounds";

interface SquadThemeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTheme: string;
  isPremium: boolean;
  onSelectTheme: (theme: string) => void;
  onOpenUpgrade?: () => void;
}

const SquadThemeSelector = ({ open, onOpenChange, currentTheme, isPremium, onSelectTheme, onOpenUpgrade }: SquadThemeSelectorProps) => {
  const [selected, setSelected] = useState(currentTheme);

  // Non-premium user: show upgrade prompt
  if (!isPremium) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center justify-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              Squad Theme
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <Palette className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
            <p className="text-sm text-muted-foreground">
              Upgrade to Full Version to unlock custom squad themes
            </p>
            <Button variant="hero" className="w-full" onClick={() => { onOpenChange(false); onOpenUpgrade?.(); }}>
              <Sparkles className="w-4 h-4 mr-2" />
              Upgrade — $1.99
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleConfirm = () => {
    playButtonSound();
    onSelectTheme(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Your Theme
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">This is your personal theme — only you will see it.</p>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {Object.values(SQUAD_THEMES).map(theme => {
            const isActive = selected === theme.key;
            return (
              <button
                key={theme.key}
                onClick={() => { playButtonSound(); setSelected(theme.key); }}
                className={`relative p-3 rounded-xl border transition-all text-left ${
                  isActive
                    ? "border-primary/60 bg-primary/10 scale-[1.02]"
                    : "border-border bg-secondary/30 hover:border-primary/30"
                }`}
              >
                {/* Color preview bar */}
                <div
                  className="w-full h-6 rounded-md mb-2"
                  style={{
                    background: theme.gradient || `hsl(${theme.primary})`,
                  }}
                />
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ background: `hsl(${theme.primary})` }}
                  />
                  <div
                    className="w-3 h-3 rounded-full border border-border/50"
                    style={{ background: `hsl(${theme.accent})` }}
                  />
                  {theme.background && (
                    <div
                      className="w-3 h-3 rounded border border-border/50"
                      style={{ background: `hsl(${theme.background})` }}
                    />
                  )}
                </div>
                <p className="text-xs font-semibold">{theme.label}</p>
                {theme.key === "default" && (
                  <p className="text-[9px] text-muted-foreground">Original</p>
                )}
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="serve"
          className="w-full mt-3"
          onClick={handleConfirm}
          disabled={selected === currentTheme}
        >
          Apply Theme
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default SquadThemeSelector;
