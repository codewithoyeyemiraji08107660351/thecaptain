/**
 * Compute the command streak for a squad based on serve history dates.
 * A streak counts consecutive days (in AEST) where at least 1 command was issued.
 */

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000; // UTC+10 (AEST, no DST)

function toAESTDateString(date: Date | string | number): string {
  const d = new Date(date);
  const aest = new Date(d.getTime() + AEST_OFFSET_MS);
  return aest.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getTodayAEST(): string {
  return toAESTDateString(new Date());
}

export function computeStreak(serveDates: (Date | string | number)[]): number {
  if (serveDates.length === 0) return 0;

  // Get unique AEST dates
  const uniqueDates = Array.from(new Set(serveDates.map(toAESTDateString))).sort().reverse();

  const today = getTodayAEST();
  // Streak must include today or yesterday to be active
  if (uniqueDates[0] !== today) {
    // Check if yesterday counts
    const yesterday = new Date(Date.now() + AEST_OFFSET_MS);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (uniqueDates[0] !== yesterdayStr) return 0;
  }

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1] + "T00:00:00Z");
    const curr = new Date(uniqueDates[i] + "T00:00:00Z");
    const diffDays = (prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000);
    if (Math.round(diffDays) === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export interface StreakDisplay {
  days: number;
  color: string; // tailwind-friendly color
  emoji: string;
}

export function getStreakDisplay(days: number): StreakDisplay | null {
  if (days < 3) return null;
  if (days >= 30) return { days, color: "#FFFFFF", emoji: "🔥" };
  if (days >= 14) return { days, color: "#A855F7", emoji: "🔥" };
  if (days >= 7) return { days, color: "#3B82F6", emoji: "🔥" };
  return { days, color: "#F97316", emoji: "🔥" };
}

/**
 * Check if a spin reset time (12am AEST) has passed since last spin.
 */
export function canSpinToday(lastSpinAt: string | null): boolean {
  if (!lastSpinAt) return true;
  
  const now = new Date();
  const aestNow = new Date(now.getTime() + AEST_OFFSET_MS);
  const todayResetAEST = new Date(aestNow.toISOString().slice(0, 10) + "T00:00:00Z");
  // Convert back to UTC
  const todayResetUTC = new Date(todayResetAEST.getTime() - AEST_OFFSET_MS);
  
  const lastSpin = new Date(lastSpinAt);
  return lastSpin < todayResetUTC;
}
