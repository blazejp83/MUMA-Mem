/**
 * Decay sweep: recalculates activation scores for all notes system-wide.
 *
 * Runs on a configurable interval to ensure activation scores stay current
 * even for unsearched memories, enabling accurate pruning candidate detection.
 */

import type { MemoryStore } from "../types/store.js";
import type { MumaConfig } from "../config.js";
import { baseLevelActivation } from "../activation/scoring.js";
import { isPruningCandidate } from "../activation/decay.js";

export interface SweepStats {
  processed: number;
  updated: number;
  pruningCandidates: number;
}

/**
 * Run a single decay sweep across all notes in the store.
 *
 * For each note:
 * 1. Skip pinned notes
 * 2. Compute base-level activation (no spreading/noise in background context)
 * 3. Check if note is a pruning candidate
 * 4. Update activation score in store
 */
export async function runDecaySweep(
  store: MemoryStore,
  config: MumaConfig,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<SweepStats> {
  const stats: SweepStats = { processed: 0, updated: 0, pruningCandidates: 0 };
  const now = new Date();
  const PAGE_SIZE = 100;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await store.listAllNotes({ limit: PAGE_SIZE, offset });
    if (batch.length === 0) break;

    for (const note of batch) {
      stats.processed++;

      // Skip pinned notes — they are exempt from decay
      if (note.pinned) continue;

      // Compute base-level activation (no spreading activation or noise in background sweep)
      const newActivation = baseLevelActivation(
        note.access_log,
        now,
        config.activation.decayParameter,
      );

      // Check if this note is a pruning candidate
      if (isPruningCandidate(newActivation, config.decay.pruneThreshold, note.pinned)) {
        stats.pruningCandidates++;
      }

      // Only update if activation actually changed (avoid unnecessary writes)
      if (newActivation !== note.activation) {
        await store.update(note.id, note.user_id, { activation: newActivation });
        stats.updated++;
      }
    }

    offset += batch.length;

    // If we got fewer than PAGE_SIZE, we've reached the end
    if (batch.length < PAGE_SIZE) break;
  }

  logger?.info(
    `[muma-mem] Decay sweep complete: ${stats.processed} processed, ${stats.updated} updated, ${stats.pruningCandidates} pruning candidates`,
  );

  return stats;
}
