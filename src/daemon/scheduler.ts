import type { MemoryStore } from "../types/store.js";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { MumaConfig } from "../config.js";
import { consolidate } from "../consolidation/consolidate.js";
import { distillMemoryMd, writeMemoryMdFile } from "../consolidation/distill.js";

// ---------------------------------------------------------------------------
// Daily Consolidation Scheduler
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000; // 24 hours in milliseconds

/**
 * Start the daily consolidation scheduler.
 *
 * Runs consolidation + MEMORY.md distillation for all users every 24 hours.
 * Does NOT run immediately on start (first run after 24h; the sweep handles
 * immediate needs).
 *
 * On each tick:
 * 1. Collect all unique user IDs from the store
 * 2. For each user: run consolidation pipeline
 * 3. For each user: distill and write MEMORY.md
 * 4. Log summary of results
 *
 * Errors for individual users are caught and logged (don't let one user's
 * failure stop others).
 *
 * @returns A cleanup function that clears the interval
 */
export function startConsolidationScheduler(
  store: MemoryStore,
  embedding: EmbeddingProvider,
  llm: LLMProvider,
  config: MumaConfig,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void },
): () => void {
  const timer = setInterval(async () => {
    try {
      await runConsolidationCycle(store, embedding, llm, logger);
    } catch (err) {
      logger?.warn(`[muma-mem] Consolidation cycle failed: ${err}`);
    }
  }, DAY_MS);

  // Return cleanup function
  return () => {
    clearInterval(timer);
  };
}

/**
 * Run a single consolidation cycle for all users.
 *
 * Exported for use by the memory.consolidate tool (on-demand for a single user)
 * and by the scheduler (for all users).
 */
async function runConsolidationCycle(
  store: MemoryStore,
  embedding: EmbeddingProvider,
  llm: LLMProvider,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<void> {
  // 1. Collect all unique user IDs
  const userIds = new Set<string>();
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const batch = await store.listAllNotes({ limit: pageSize, offset });
    if (batch.length === 0) break;

    for (const note of batch) {
      userIds.add(note.user_id);
    }

    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  if (userIds.size === 0) {
    logger?.info("[muma-mem] Consolidation: no users found, skipping.");
    return;
  }

  let consolidated = 0;
  let distilled = 0;
  let errors = 0;

  // 2. Process each user
  for (const userId of userIds) {
    try {
      // 2a. Run consolidation pipeline
      await consolidate(userId, store, embedding, llm);
      consolidated++;

      // 2b. Distill and write MEMORY.md
      const content = await distillMemoryMd(userId, store, llm);
      await writeMemoryMdFile(content, userId);
      distilled++;
    } catch (err) {
      errors++;
      logger?.warn(`[muma-mem] Consolidation failed for user ${userId}: ${err}`);
      // Continue to next user
    }
  }

  logger?.info(
    `[muma-mem] Consolidation complete: ${consolidated} consolidated, ${distilled} distilled, ${errors} errors (${userIds.size} users)`,
  );
}
