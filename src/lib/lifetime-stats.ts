import { supabase } from "@/integrations/supabase/client";

export type LifetimeStatKey =
  | "commands_received" | "commands_completed" | "commands_failed"
  | "commands_issued" | "total_promotions" | "total_demotions"
  | "total_squads_joined" | "total_captain_titles"
  | "total_strikes" | "total_punishments_completed" | "total_punishments_failed"
  | "total_warnings" | "total_action_credits_used" | "total_super_credits_used"
  | "shield_uses" | "friendly_fire_uses" | "power_trip_uses"
  | "stray_bullet_uses" | "coup_uses" | "rank_lottery_uses"
  | "saboteur_uses" | "successful_coups" | "total_spins"
  | "spin_action_credits_earned" | "spin_super_credits_earned";

/**
 * Fire-and-forget stat tracking via SECURITY DEFINER RPC.
 */
export function trackStat(userId: string, stat: LifetimeStatKey, amount: number = 1) {
  if (!userId) return;
  (async () => {
    try {
      await (supabase.rpc as any)("track_lifetime_stat", { _stat: stat, _amount: amount });
    } catch {
      // Silent — non-critical tracking
    }
  })();
}

/** Update highest rank if the new commands value is higher */
export function trackHighestRank(userId: string, commands: number) {
  if (!userId) return;
  (async () => {
    try {
      await (supabase.rpc as any)("track_highest_rank", { _commands: commands });
    } catch {}
  })();
}

/** Update best spin reward (store reward label string) */
export function trackBestSpinReward(userId: string, reward: string) {
  if (!userId) return;
  (async () => {
    try {
      await (supabase.rpc as any)("track_best_spin_reward", { _reward: reward });
    } catch {}
  })();
}

/**
 * Ensure a user_lifetime_stats row exists for a given user.
 */
export function ensureStatsRow(userId: string) {
  if (!userId) return;
  (async () => {
    try {
      await (supabase.rpc as any)("ensure_lifetime_stats_row", { _user_id: userId });
    } catch {}
  })();
}
