import { useState, useEffect } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { playButtonSound } from "@/lib/sounds";

interface SquadItem {
  id: string;
  name: string;
}

interface SquadReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squads: SquadItem[];
  currentOrder: string[];
  onSave: (order: string[]) => void;
}

const SquadReorderDialog = ({ open, onOpenChange, squads, currentOrder, onSave }: SquadReorderDialogProps) => {
  const [orderedSquads, setOrderedSquads] = useState<SquadItem[]>([]);

  useEffect(() => {
    if (!open) return;
    const ordered = currentOrder.length > 0
      ? squads.slice().sort((a, b) => {
          const ai = currentOrder.indexOf(a.id);
          const bi = currentOrder.indexOf(b.id);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
      : squads;
    setOrderedSquads(ordered);
  }, [open, squads, currentOrder]);

  const moveSquad = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedSquads.length) return;
    playButtonSound();
    setOrderedSquads((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const handleSave = () => {
    playButtonSound();
    onSave(orderedSquads.map((s) => s.id));
    onOpenChange(false);
    toast.success("Custom order saved!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Custom Order</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">Use the arrows to move squads up or down — positions always auto-rebalance.</p>
        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-none">
          {orderedSquads.map((s, index) => (
            <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/60">
              <div className="w-8 h-8 rounded-md bg-background/70 border border-border/70 flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                {index + 1}
              </div>
              <span className="text-sm font-medium truncate flex-1">{s.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => moveSquad(index, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === orderedSquads.length - 1} onClick={() => moveSquad(index, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="hero" className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SquadReorderDialog;
