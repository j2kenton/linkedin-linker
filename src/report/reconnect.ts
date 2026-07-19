const BASE_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Caps reconnect delays so a temporarily unavailable extension worker does
 * not cause a tight connect/disconnect loop in an open report tab.
 */
export function reconnectDelay(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** safeAttempt);
}
