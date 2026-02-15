/**
 * Daemon module: background tasks for the memory system.
 *
 * Currently provides the decay sweep scheduler that recalculates
 * activation scores on a configurable interval.
 */

export { runDecaySweep } from "./sweep.js";
export type { SweepStats } from "./sweep.js";

import { runDecaySweep } from "./sweep.js";
import type { MemoryStore } from "../types/store.js";
import type { MumaConfig } from "../config.js";

/**
 * Start the decay sweep scheduler.
 *
 * Runs an initial sweep immediately, then schedules recurring sweeps
 * at the configured interval (config.decay.sweepIntervalMinutes).
 *
 * @returns A cleanup function that stops the scheduler
 */
export function startSweepScheduler(
  store: MemoryStore,
  config: MumaConfig,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void },
): () => void {
  const intervalMs = config.decay.sweepIntervalMinutes * 60 * 1000;

  // Run initial sweep immediately (fire-and-forget)
  runDecaySweep(store, config, logger).catch((err) => {
    logger?.warn(`[muma-mem] Initial decay sweep failed: ${err}`);
  });

  // Schedule recurring sweeps
  const timer = setInterval(() => {
    runDecaySweep(store, config, logger).catch((err) => {
      logger?.warn(`[muma-mem] Decay sweep failed: ${err}`);
    });
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(timer);
  };
}
