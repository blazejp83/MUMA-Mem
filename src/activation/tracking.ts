/**
 * Access tracking module.
 *
 * Records retrieval timestamps, reinforces half-life, and recomputes
 * activation scores when a note is accessed during search.
 */

import type { Note } from "../types/note.js";
import type { MemoryStore } from "../types/store.js";
import type { MumaConfig } from "../config.js";
import { baseLevelActivation } from "./scoring.js";
import { reinforceHalfLife } from "./decay.js";

/**
 * Track a note access: append timestamp, increment count,
 * reinforce half-life, recompute activation, and persist.
 *
 * Designed to be called fire-and-forget (non-blocking).
 *
 * @param noteId - ID of the accessed note
 * @param userId - User isolation key
 * @param currentNote - Current note state (avoids re-read)
 * @param store - Memory store for persisting updates
 * @param config - Plugin config for activation parameters
 */
export async function trackAccess(
  noteId: string,
  userId: string,
  currentNote: Note,
  store: MemoryStore,
  config: MumaConfig,
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Append current timestamp to access log
  const accessLog = [...currentNote.access_log, nowIso];

  // Increment access count
  const accessCount = currentNote.access_count + 1;

  // Reinforce half-life on retrieval
  const halfLife = reinforceHalfLife(currentNote.half_life);

  // Recompute base-level activation with updated log
  const activation = baseLevelActivation(
    accessLog,
    now,
    config.activation.decayParameter,
  );

  // Persist all updates via store.update()
  await store.update(noteId, userId, {
    access_count: accessCount,
    access_log: accessLog,
    activation,
    half_life: halfLife,
  });
}
