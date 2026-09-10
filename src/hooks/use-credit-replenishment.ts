import { useState } from "react";

/**
 * Credit replenishment is disabled.
 * Previously awarded 1 free action credit after 30 days and 1 free super action credit after 45 days.
 */
export function useCreditReplenishment(_userId: string | undefined) {
  // Keep a useState call so the hook count stays stable across HMR updates
  const [awardPrompt] = useState<null>(null);
  return { awardPrompt, dismissPrompt: () => {} };
}
