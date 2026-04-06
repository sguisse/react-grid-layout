/**
 * Lightweight logging utility with per-message throttling to avoid
 * flooding the console during high-frequency events (drag, pointermove, etc.).
 */

const DEFAULT_THROTTLE_MS = 100;

const lastLogTimes = new Map<string, number>();

export function logDebug(...args: any[]): void {
  try {
    // Compute a stable key for throttling based on the first argument when
    // it's a string (common case). Fall back to stringified first arg.
    const key = typeof args[0] === "string" ? args[0] : JSON.stringify(args[0] ?? "");
    const now = Date.now();
    const last = lastLogTimes.get(key) ?? 0;
    if (now - last < DEFAULT_THROTTLE_MS) {
      return;
    }
    lastLogTimes.set(key, now);
    // eslint-disable-next-line no-console
    const ts = new Date(now).toISOString();
    console.debug(`[${ts}]`, ...args);
  } catch (err) {
    // Swallow logging errors to avoid breaking application flow
  }
}

export default logDebug;
