import { performance } from 'node:perf_hooks';

/**
 * Opt-in timing logs for the hot paths (startup, hotkey to visible popup, paste).
 * Enable with `CLIPPO_PERF=1 npm start`; it is a no-op otherwise so it costs nothing in production.
 */
const enabled = process.env.CLIPPO_PERF === '1';

export function perfMark(label: string): () => void {
  if (!enabled) return () => undefined;
  const start = performance.now();
  return () => console.log(`[perf] ${label}: ${(performance.now() - start).toFixed(1)} ms`);
}

/** Logs the time elapsed since the process started (Node's performance time origin). */
export function perfSinceStart(label: string): void {
  if (enabled) console.log(`[perf] ${label}: ${performance.now().toFixed(1)} ms since process start`);
}
