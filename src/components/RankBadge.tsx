import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRank, getNextRank, RANKS } from "@/lib/ranks";
import { MILESTONES } from "@/components/RankMilestonePrompt";
import { ScrollArea } from "@/components/ui/scroll-area";

const MILESTONE_ABBREVIATIONS = new Set(MILESTONES.map(m => m.rank));

interface RankBadgeProps {
  completedCommands: number;
  strikes: number;
  warnings?: number;
  showStrikes?: boolean;
  showWarnings?: boolean;
  size?: "sm" | "md";
}

const RankBadge = ({ completedCommands, strikes, warnings = 0, showStrikes = true, showWarnings = true, size = "sm" }: RankBadgeProps) => {
  const [showRanks, setShowRanks] = useState(false);
  const rank = getRank(completedCommands);
  const nextRank = getNextRank(completedCommands);

  return (
    <>
      <span className="inline-flex items-center gap-1 invert-protect">
        {showStrikes && strikes > 0 && (
          <span className="text-xs text-destructive font-bold">{"❌".repeat(Math.min(strikes, 3))}</span>
        )}
        {showWarnings && warnings > 0 && (
          <span className="text-xs font-bold">{"⚠️".repeat(Math.min(warnings, 3))}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowRanks(true); }}
          className="inline-flex items-center hover:scale-110 transition-transform"
          title={`${rank.title} (${rank.abbreviation})`}
        >
          <span className={size === "sm" ? "text-sm" : "text-lg"}>{rank.badge}</span>
        </button>
      </span>

      <Dialog open={showRanks} onOpenChange={setShowRanks}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Navy Ranks</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1 pr-3">
              {[...RANKS].reverse().map((r) => {
                const isCurrent = r.abbreviation === rank.abbreviation;
                const isAchieved = completedCommands >= r.commandsRequired;
                return (
                  <div
                    key={r.abbreviation}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-sm transition-all ${
                      isCurrent
                        ? "bg-primary/10 border border-primary/30"
                        : isAchieved
                        ? "bg-secondary/50"
                        : "opacity-40"
                    }`}
                  >
                    <span className="text-lg w-7 text-center invert-protect">{r.badge}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold ${isCurrent ? "text-primary" : MILESTONE_ABBREVIATIONS.has(r.abbreviation) ? "" : ""}`} style={MILESTONE_ABBREVIATIONS.has(r.abbreviation) && !isCurrent ? { color: "hsl(43 80% 50%)" } : undefined}>
                        {r.title}
                        <span className={`font-normal ml-1 ${MILESTONE_ABBREVIATIONS.has(r.abbreviation) && !isCurrent ? "" : "text-muted-foreground"}`} style={MILESTONE_ABBREVIATIONS.has(r.abbreviation) && !isCurrent ? { color: "hsl(43 70% 45%)" } : undefined}>({r.abbreviation})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.commandsRequired === 0 ? "Starting rank" : `${r.commandsRequired} command${r.commandsRequired > 1 ? "s" : ""} completed`}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold shrink-0">YOU</span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          {nextRank && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Next: {nextRank.badge} {nextRank.title} — {nextRank.commandsRequired - completedCommands} more command{nextRank.commandsRequired - completedCommands > 1 ? "s" : ""} needed
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RankBadge;
