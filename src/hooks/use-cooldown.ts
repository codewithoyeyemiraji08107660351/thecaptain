import { useRef, useCallback } from "react";

/**
 * Returns a guarded callback that can only fire once per `cooldownMs`.
 * Subsequent calls during cooldown are silently ignored.
 */
export function useCooldown<T extends (...args: any[]) => any>(
  fn: T,
  cooldownMs = 500
): T {
  const lastCallRef = useRef(0);

  return useCallback(
    (...args: any[]) => {
      const now = Date.now();
      if (now - lastCallRef.current < cooldownMs) return;
      lastCallRef.current = now;
      return fn(...args);
    },
    [fn, cooldownMs]
  ) as unknown as T;
}
