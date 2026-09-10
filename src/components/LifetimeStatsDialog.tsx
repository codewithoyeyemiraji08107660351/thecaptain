import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRank } from "@/lib/ranks";

interface LifetimeStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  isPremium: boolean;
  memberSince?: string;
  onOpenUpgrade?: () => void;
}

interface Stats {
  commands_received: number;
  commands_completed: number;
  commands_failed: number;
  commands_issued: number;
  highest_rank_commands: number;
  total_promotions: number;
  total_demotions: number;
  total_squads_joined: number;
  total_captain_titles: number;
  total_strikes: number;
  total_punishments_completed: number;
  total_punishments_failed: number;
  total_warnings: number;
  total_action_credits_used: number;
  total_super_credits_used: number;
  shield_uses: number;
  friendly_fire_uses: number;
  power_trip_uses: number;
  stray_bullet_uses: number;
  coup_uses: number;
  rank_lottery_uses: number;
  saboteur_uses: number;
  successful_coups: number;
  total_spins: number;
  best_spin_reward: string | null;
  spin_action_credits_earned: number;
  spin_super_credits_earned: number;
}

const defaultStats: Stats = {
  commands_received: 0, commands_completed: 0, commands_failed: 0,
  commands_issued: 0, highest_rank_commands: 0, total_promotions: 0,
  total_demotions: 0, total_squads_joined: 0, total_captain_titles: 0,
  total_strikes: 0, total_punishments_completed: 0, total_punishments_failed: 0,
  total_warnings: 0, total_action_credits_used: 0, total_super_credits_used: 0,
  shield_uses: 0, friendly_fire_uses: 0, power_trip_uses: 0,
  stray_bullet_uses: 0, coup_uses: 0, rank_lottery_uses: 0,
  saboteur_uses: 0, successful_coups: 0, total_spins: 0,
  best_spin_reward: null, spin_action_credits_earned: 0, spin_super_credits_earned: 0,
};

const StatRow = ({ emoji, label, value }: { emoji: string; label: string; value: string | number }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm text-muted-foreground">
      <span className="invert-protect mr-1.5">{emoji}</span>{label}
    </span>
    <span className="text-sm font-semibold tabular-nums">{value}</span>
  </div>
);

const StatSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="p-3 rounded-xl bg-secondary/50 border border-border">
    <h3 className="text-xs font-display font-bold text-primary mb-2 uppercase tracking-wider">{title}</h3>
    {children}
  </div>
);

const LifetimeStatsDialog = ({ open, onOpenChange, userId, isPremium, memberSince, onOpenUpgrade }: LifetimeStatsDialogProps) => {
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId || !isPremium) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("user_lifetime_stats")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) setStats(data as Stats);
      else setStats(defaultStats);
      setLoading(false);
    })();
  }, [open, userId, isPremium]);

  if (!isPremium) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center justify-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              Lifetime Stats
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
            <p className="text-sm text-muted-foreground">
              Upgrade to Full Version to unlock your lifetime stats across all squads
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

  const completionRate = stats.commands_received > 0
    ? Math.round((stats.commands_completed / stats.commands_received) * 100)
    : 0;

  const highestRank = getRank(stats.highest_rank_commands);

  const favouriteAction = (() => {
    const actions = [
      { name: "Shield", uses: stats.shield_uses },
      { name: "Friendly Fire", uses: stats.friendly_fire_uses },
      { name: "Power Trip", uses: stats.power_trip_uses },
      { name: "Stray Bullet", uses: stats.stray_bullet_uses },
    ];
    const max = Math.max(...actions.map(a => a.uses));
    if (max === 0) return "None yet";
    return actions.find(a => a.uses === max)?.name || "None yet";
  })();

  const favouriteSuperAction = (() => {
    const actions = [
      { name: "Coup D'état", uses: stats.coup_uses },
      { name: "Rank Lottery", uses: stats.rank_lottery_uses },
      { name: "Saboteur", uses: stats.saboteur_uses },
    ];
    const max = Math.max(...actions.map(a => a.uses));
    if (max === 0) return "None yet";
    return actions.find(a => a.uses === max)?.name || "None yet";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col [&>button]:hidden [&_.scroll-area-viewport]:!overflow-y-auto [&_[data-radix-scroll-area-scrollbar]]:hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Lifetime Stats
          </DialogTitle>
        </DialogHeader>

        {memberSince && (
          <p className="text-xs text-muted-foreground text-center -mt-1">
            Member since {new Date(memberSince).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y scrollbar-none">
          <div className="space-y-3 pr-2 pb-2">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading stats...</p>
            ) : (
              <>
                <StatSection title="🎮 Commands & Gameplay">
                  <StatRow emoji="📥" label="Commands received" value={stats.commands_received} />
                  <StatRow emoji="✅" label="Commands completed" value={stats.commands_completed} />
                  <StatRow emoji="❌" label="Commands failed" value={stats.commands_failed} />
                  <StatRow emoji="📊" label="Completion rate" value={`${completionRate}%`} />
                  <StatRow emoji="📤" label="Commands issued as Captain" value={stats.commands_issued} />
                </StatSection>

                <StatSection title="⭐ Rank & Progression">
                  <StatRow emoji="👑" label="Highest rank achieved" value={`${highestRank.badge} ${highestRank.title}`} />
                  <StatRow emoji="⬆️" label="Total promotions" value={stats.total_promotions} />
                  <StatRow emoji="⬇️" label="Total demotions" value={stats.total_demotions} />
                  <StatRow emoji="🏴‍☠️" label="Total squads joined" value={stats.total_squads_joined} />
                  <StatRow emoji="⚓" label="Times held Captain title" value={stats.total_captain_titles} />
                </StatSection>

                <StatSection title="⚠️ Punishments & Strikes">
                  <StatRow emoji="❌" label="Total strikes received" value={stats.total_strikes} />
                  <StatRow emoji="✅" label="Punishments completed" value={stats.total_punishments_completed} />
                  <StatRow emoji="💀" label="Punishments failed" value={stats.total_punishments_failed} />
                  <StatRow emoji="⚠️" label="Total warnings received" value={stats.total_warnings} />
                </StatSection>

                <StatSection title="⚡ Actions & Super Actions">
                  <StatRow emoji="⚡" label="Action credits used" value={stats.total_action_credits_used} />
                  <StatRow emoji="👑" label="Super credits used" value={stats.total_super_credits_used} />
                  <StatRow emoji="🛡️" label="Shield uses" value={stats.shield_uses} />
                  <StatRow emoji="🔄" label="Friendly Fire uses" value={stats.friendly_fire_uses} />
                  <StatRow emoji="💪" label="Power Trip uses" value={stats.power_trip_uses} />
                  <StatRow emoji="🔫" label="Stray Bullet uses" value={stats.stray_bullet_uses} />
                  <StatRow emoji="⚔️" label="Coup D'état uses" value={stats.coup_uses} />
                  <StatRow emoji="🎰" label="Rank Lottery uses" value={stats.rank_lottery_uses} />
                  <StatRow emoji="💣" label="Saboteur uses" value={stats.saboteur_uses} />
                  <StatRow emoji="🏆" label="Successful Coup D'états" value={stats.successful_coups} />
                  <StatRow emoji="⭐" label="Favourite action" value={favouriteAction} />
                  <StatRow emoji="💎" label="Favourite super action" value={favouriteSuperAction} />
                </StatSection>

                <StatSection title="🎲 Daily Spin">
                  <StatRow emoji="🎲" label="Total spins completed" value={stats.total_spins} />
                  <StatRow emoji="🏆" label="Best reward ever won" value={stats.best_spin_reward || "None yet"} />
                  <StatRow emoji="⚡" label="Action credits from spins" value={stats.spin_action_credits_earned} />
                  <StatRow emoji="👑" label="Super credits from spins" value={stats.spin_super_credits_earned} />
                </StatSection>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 pt-2 border-t border-border">
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LifetimeStatsDialog;
